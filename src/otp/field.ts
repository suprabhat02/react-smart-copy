import { copyFailure } from '../core/errors';
import { emptyChars, inputStep, keyStep, pasteStep, setStep, type OtpKey, type OtpSettings, type OtpStep } from './state';
import type { OtpAlphabet } from './normalize';
import { receiveWebOtp, type WebOtpStatus } from './web-otp';

export interface OtpFieldOptions {
  /** How many characters the code has: one box each. Default 6. */
  readonly length?: number;
  /** Default `'numeric'`. */
  readonly alphabet?: OtpAlphabet;
  /**
   * Each box's accessible name. Default `Digit 1 of 6` (`Character 1 of 6` for alphanumeric
   * codes). Name the group around the boxes too (`role="group"` with a label).
   */
  readonly label?: (index: number, length: number) => string;
  /**
   * Fill the code from an SMS with the WebOTP API, where the browser has it (Chrome on
   * Android): the message must end with `@your.host #code`. Asked for when the boxes are
   * attached; cancelled when they are detached, or when the code is typed. Default `false`.
   */
  readonly webOtp?: boolean;
  /** Called when the value changes. */
  readonly onChange?: (snapshot: OtpSnapshot) => void;
  /** Called when every box is filled, with the code. Again after an edit fills them anew. */
  readonly onComplete?: (code: string) => void;
}

export interface OtpSnapshot {
  /** Each box's character: `''` for an empty box. */
  readonly chars: readonly string[];
  /** The characters typed so far, in order, without gaps. */
  readonly value: string;
  /** Every box holds a character: `value` is the code. */
  readonly complete: boolean;
  /** Where filling the code from an SMS stands. `idle` unless `webOtp` is on. */
  readonly webOtp: WebOtpStatus;
}

/** The field's functions are bound: pass them around freely (`onClick={field.clear}`). */
export interface OtpField {
  /**
   * Wires up the boxes (one `<input>` each, in order): their typing, pasting, autofill,
   * keys, focus and attributes. Returns a function that undoes it. Boxes are wired to one
   * field at a time: attaching again first detaches the previous boxes.
   */
  readonly attach: (inputs: readonly HTMLInputElement[]) => () => void;
  /** The current state. A new object after each change, the same one otherwise. */
  readonly getSnapshot: () => OtpSnapshot;
  /** Calls `listener` after each change. Returns a function that stops it. */
  readonly subscribe: (listener: () => void) => () => void;
  /** Fills the boxes with `code` from the first (characters a code can't have are dropped). */
  readonly setValue: (code: string) => void;
  /** Empties every box and focuses the first. */
  readonly clear: () => void;
  /** Focuses the first empty box (or the last, when all are filled). */
  readonly focus: () => void;
}

const KEYS: ReadonlySet<string> = new Set<OtpKey>(['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

/**
 * A one-time code field over a row of single-character boxes, without a framework:
 * typing moves to the next box, Backspace to the one before; pasting a code, or an SMS
 * holding one, fills every box from any of them; an SMS autofill into the first box
 * (iOS, Android) fills them all. `useOtpField` is this, for React.
 *
 * @throws {CopyFailure} `invalid-payload` for a `length` that is not 1 to 32.
 */
export function createOtpField(options: OtpFieldOptions = {}): OtpField {
  const length = options.length ?? 6;
  if (!Number.isInteger(length) || length < 1 || length > 32) throw copyFailure('invalid-payload', 'length must be a whole number from 1 to 32.');
  const settings: OtpSettings = { length, alphabet: options.alphabet ?? 'numeric' };
  const listeners = new Set<() => void>();
  let snapshot: OtpSnapshot = { chars: emptyChars(length), value: '', complete: false, webOtp: 'idle' };
  let boxes: readonly HTMLInputElement[] = [];
  let detach: (() => void) | null = null;
  let webOtpAbort: AbortController | null = null;

  /** Stops waiting for an SMS, with how it ended. */
  function stopWebOtp(status: WebOtpStatus): void {
    if (webOtpAbort === null) return;
    webOtpAbort.abort();
    webOtpAbort = null;
    publish({ ...snapshot, webOtp: status });
  }

  function publish(next: OtpSnapshot): void {
    snapshot = next;
    options.onChange?.(next);
    for (const listener of [...listeners]) listener();
  }

  function render(step: OtpStep, focus: boolean): void {
    boxes.forEach((box, index) => {
      const char = step.chars[index] as string;
      if (box.value !== char) box.value = char;
    });
    if (focus) {
      const box = boxes[step.focus];
      box?.focus();
      box?.select();
    }
    const same = step.chars.every((char, index) => char === snapshot.chars[index]);
    if (same) return;
    const value = step.chars.join('');
    const complete = step.chars.every((char) => char !== '');
    publish({ ...snapshot, chars: step.chars, value, complete });
    // Only a change gets here: a complete field's code is a new one.
    if (complete) {
      // The code is in: an SMS that comes later must not replace it.
      stopWebOtp('aborted');
      options.onComplete?.(value);
    }
  }

  function wire(inputs: readonly HTMLInputElement[]): () => void {
    const stops: (() => void)[] = [];
    const on = <K extends keyof HTMLElementEventMap>(target: HTMLInputElement, type: K, handler: (event: HTMLElementEventMap[K]) => void): void => {
      target.addEventListener(type, handler);
      stops.push(() => {
        target.removeEventListener(type, handler);
      });
    };
    const label = options.label ?? ((index: number, total: number) => `${settings.alphabet === 'numeric' ? 'Digit' : 'Character'} ${String(index + 1)} of ${String(total)}`);
    inputs.forEach((input, index) => {
      const restore = ['autocomplete', 'inputmode', 'aria-label', 'autocapitalize', 'spellcheck', 'pattern'].map((name) => [name, input.getAttribute(name)] as const);
      stops.push(() => {
        for (const [name, value] of restore) {
          if (value === null) input.removeAttribute(name);
          else input.setAttribute(name, value);
        }
      });
      // Only the first box takes the SMS autofill: browsers put the whole code there.
      input.setAttribute('autocomplete', index === 0 ? 'one-time-code' : 'off');
      input.setAttribute('inputmode', settings.alphabet === 'numeric' ? 'numeric' : 'text');
      input.setAttribute('aria-label', label(index, length));
      input.setAttribute('autocapitalize', settings.alphabet === 'numeric' ? 'off' : 'characters');
      input.setAttribute('spellcheck', 'false');
      if (settings.alphabet === 'numeric') input.setAttribute('pattern', '[0-9]*');
      else input.removeAttribute('pattern');
      input.value = snapshot.chars[index] as string;

      // Selecting the box's character on focus makes typing replace it.
      on(input, 'focus', () => {
        input.select();
      });
      on(input, 'keydown', (event) => {
        if (!KEYS.has(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        render(keyStep(snapshot.chars, index, event.key as OtpKey, settings), true);
      });
      on(input, 'beforeinput', (event) => {
        // A delete in an empty box (soft keyboards send no Backspace key): go back, as Backspace does.
        if (event.inputType.startsWith('delete') && input.value === '') {
          event.preventDefault();
          render(keyStep(snapshot.chars, index, 'Backspace', settings), true);
        }
      });
      on(input, 'input', () => {
        // The box showed its character in `snapshot` until this input: that is what was there before.
        render(inputStep(snapshot.chars, index, snapshot.chars[index] as string, input.value, settings), true);
      });
      on(input, 'paste', (event) => {
        event.preventDefault();
        const text = event.clipboardData?.getData('text/plain') ?? '';
        render(pasteStep(snapshot.chars, index, text, settings), true);
      });
    });

    if (options.webOtp === true && !snapshot.complete) {
      const abort = new AbortController();
      webOtpAbort = abort;
      publish({ ...snapshot, webOtp: 'waiting' });
      void receiveWebOtp(abort.signal).then((result) => {
        if (abort.signal.aborted) return;
        webOtpAbort = null;
        if (result.status === 'received') render(setStep(result.code, settings), false);
        publish({ ...snapshot, webOtp: result.status });
      });
    }
    return () => {
      for (const stop of stops) stop();
      stopWebOtp('aborted');
    };
  }

  const field: OtpField = {
    attach: (inputs) => {
      detach?.();
      boxes = [...inputs];
      const undo = wire(boxes);
      let attached = true;
      detach = () => {
        if (!attached) return;
        attached = false;
        undo();
        boxes = [];
        detach = null;
      };
      return detach;
    },
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setValue: (code) => {
      render(setStep(code, settings), false);
    },
    clear: () => {
      render({ chars: emptyChars(length), focus: 0 }, true);
    },
    focus: () => {
      const empty = snapshot.chars.indexOf('');
      boxes[empty === -1 ? length - 1 : empty]?.focus();
    },
  };
  return field;
}
