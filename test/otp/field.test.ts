import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOtpField, type OtpFieldOptions } from '../../src/otp';

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function boxes(count = 6): HTMLInputElement[] {
  const inputs = Array.from({ length: count }, () => document.createElement('input'));
  document.body.append(...inputs);
  return inputs;
}

function setup(options: OtpFieldOptions = {}, count = options.length ?? 6) {
  const onChange = vi.fn();
  const onComplete = vi.fn();
  const field = createOtpField({ onChange, onComplete, ...options });
  const inputs = boxes(count);
  const detach = field.attach(inputs);
  const values = (): string => inputs.map((input) => input.value || '.').join('');
  const focused = (): number => inputs.indexOf(document.activeElement as HTMLInputElement);
  return { field, inputs, detach, onChange, onComplete, values, focused };
}

/** Types `value` into `input` as the browser would: the value changes, then `input` fires. */
function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function key(input: HTMLInputElement, name: string, modifiers: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...modifiers });
  input.dispatchEvent(event);
  return event;
}

function paste(input: HTMLInputElement, text: string | null): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: text === null ? null : { getData: (format: string) => (format === 'text/plain' ? text : '') } });
  input.dispatchEvent(event);
  return event;
}

describe('createOtpField', () => {
  it('sets each box up for codes: autofill on the first, keypad, accessible names', () => {
    const { inputs } = setup();
    expect(inputs.map((input) => input.getAttribute('autocomplete'))).toEqual(['one-time-code', 'off', 'off', 'off', 'off', 'off']);
    expect(inputs[0]?.getAttribute('inputmode')).toBe('numeric');
    expect(inputs[0]?.getAttribute('pattern')).toBe('[0-9]*');
    expect(inputs[0]?.getAttribute('autocapitalize')).toBe('off');
    expect(inputs[0]?.getAttribute('spellcheck')).toBe('false');
    expect(inputs.map((input) => input.getAttribute('aria-label'))).toEqual(['Digit 1 of 6', 'Digit 2 of 6', 'Digit 3 of 6', 'Digit 4 of 6', 'Digit 5 of 6', 'Digit 6 of 6']);
  });

  it('labels alphanumeric boxes as characters, or as asked', () => {
    const alnum = setup({ alphabet: 'alphanumeric', length: 4 });
    expect(alnum.inputs[0]?.getAttribute('aria-label')).toBe('Character 1 of 4');
    expect(alnum.inputs[0]?.getAttribute('inputmode')).toBe('text');
    expect(alnum.inputs[0]?.getAttribute('autocapitalize')).toBe('characters');
    expect(alnum.inputs[0]?.hasAttribute('pattern')).toBe(false);
    const named = setup({ label: (index, total) => `Ziffer ${String(index + 1)}/${String(total)}` });
    expect(named.inputs[1]?.getAttribute('aria-label')).toBe('Ziffer 2/6');
  });

  it('moves on as people type, and calls onComplete once the code is in', () => {
    const { inputs, values, focused, onComplete, field } = setup();
    for (const [index, digit] of Array.from('482913').entries()) {
      inputs[index]?.focus();
      type(inputs[index] as HTMLInputElement, digit);
      expect(focused()).toBe(Math.min(index + 1, 5));
    }
    expect(values()).toBe('482913');
    expect(field.getSnapshot()).toMatchObject({ value: '482913', complete: true, chars: Array.from('482913') });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('482913');
    // Typing the same digit again changes nothing, and calls nobody.
    type(inputs[5] as HTMLInputElement, '3');
    expect(onComplete).toHaveBeenCalledTimes(1);
    // A changed digit gives a new code.
    type(inputs[5] as HTMLInputElement, '7');
    expect(onComplete).toHaveBeenLastCalledWith('482917');
  });

  it('fills every box from an SMS autofill into the first', () => {
    const { inputs, values, onComplete } = setup();
    type(inputs[0] as HTMLInputElement, '482913');
    expect(values()).toBe('482913');
    expect(onComplete).toHaveBeenCalledWith('482913');
  });

  it('fills every box from a paste into any of them', () => {
    const { inputs, values, focused } = setup();
    const event = paste(inputs[3] as HTMLInputElement, 'Your verification code is 482913.');
    expect(event.defaultPrevented).toBe(true);
    expect(values()).toBe('482913');
    expect(focused()).toBe(5);
    paste(inputs[0] as HTMLInputElement, null);
    expect(values()).toBe('482913');
  });

  it('handles Backspace, Delete, arrows, Home and End, and leaves other keys alone', () => {
    const { inputs, values, focused, field, onComplete } = setup();
    field.setValue('482');
    expect(values()).toBe('482...');
    inputs[3]?.focus();
    expect(key(inputs[3] as HTMLInputElement, 'Backspace').defaultPrevented).toBe(true);
    expect(values()).toBe('48....');
    expect(focused()).toBe(2);
    key(inputs[2] as HTMLInputElement, 'ArrowLeft');
    expect(focused()).toBe(1);
    key(inputs[1] as HTMLInputElement, 'Delete');
    expect(values()).toBe('4.....');
    key(inputs[1] as HTMLInputElement, 'End');
    expect(focused()).toBe(1);
    key(inputs[1] as HTMLInputElement, 'Home');
    expect(focused()).toBe(0);
    key(inputs[0] as HTMLInputElement, 'ArrowRight');
    expect(focused()).toBe(1);
    expect(key(inputs[1] as HTMLInputElement, 'Tab').defaultPrevented).toBe(false);
    expect(key(inputs[1] as HTMLInputElement, 'Backspace', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key(inputs[1] as HTMLInputElement, 'ArrowLeft', { metaKey: true }).defaultPrevented).toBe(false);
    expect(key(inputs[1] as HTMLInputElement, 'ArrowLeft', { altKey: true }).defaultPrevented).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('goes back on a delete in an empty box, as soft keyboards send it', () => {
    const { inputs, values, focused, field } = setup();
    field.setValue('48');
    const back = new InputEvent('beforeinput', { inputType: 'deleteContentBackward', cancelable: true });
    inputs[2]?.dispatchEvent(back);
    expect(back.defaultPrevented).toBe(true);
    expect(values()).toBe('4.....');
    expect(focused()).toBe(1);
    // In a box with a character, the browser deletes it, and `input` follows.
    const own = new InputEvent('beforeinput', { inputType: 'deleteContentBackward', cancelable: true });
    inputs[0]?.dispatchEvent(own);
    expect(own.defaultPrevented).toBe(false);
    const insert = new InputEvent('beforeinput', { inputType: 'insertText', data: '5', cancelable: true });
    inputs[2]?.dispatchEvent(insert);
    expect(insert.defaultPrevented).toBe(false);
  });

  it('selects a box on focus, so typing replaces its character', () => {
    const { inputs, field } = setup();
    field.setValue('4');
    const select = vi.spyOn(inputs[0] as HTMLInputElement, 'select');
    inputs[0]?.dispatchEvent(new FocusEvent('focus'));
    expect(select).toHaveBeenCalled();
  });

  it('is driven by setValue, clear and focus, and tells subscribers', () => {
    const { field, values, focused, onChange } = setup();
    const listener = vi.fn();
    const stop = field.subscribe(listener);
    field.setValue('482913');
    expect(values()).toBe('482913');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ value: '482913', complete: true }));
    field.focus();
    expect(focused()).toBe(5);
    field.clear();
    expect(values()).toBe('......');
    expect(focused()).toBe(0);
    field.setValue('48');
    field.focus();
    expect(focused()).toBe(2);
    stop();
    field.setValue('');
    expect(listener).toHaveBeenCalledTimes(3);
    // A step that changes nothing publishes nothing.
    const before = field.getSnapshot();
    field.setValue('');
    expect(field.getSnapshot()).toBe(before);
  });

  it('detaches cleanly, restoring the boxes, and re-attaches to new ones', () => {
    const field = createOtpField({ length: 4 });
    const first = boxes(4);
    first[0]?.setAttribute('aria-label', 'Mine');
    const detach = field.attach(first);
    field.setValue('4829');
    const second = boxes(4);
    field.attach(second);
    expect(first[0]?.getAttribute('aria-label')).toBe('Mine');
    expect(first[1]?.hasAttribute('autocomplete')).toBe(false);
    expect(second.map((input) => input.value).join('')).toBe('4829');
    type(first[0] as HTMLInputElement, '1');
    expect(field.getSnapshot().value).toBe('4829');
    detach();
    field.attach(second)();
    expect(second[0]?.hasAttribute('autocomplete')).toBe(false);
    field.setValue('1111');
    expect(second[0]?.value).toBe('4');
    field.focus();
  });

  it('refuses a length that is not 1 to 32', () => {
    for (const length of [0, 33, 2.5, Number.NaN]) {
      expect(() => createOtpField({ length })).toThrow(expect.objectContaining({ copyError: expect.objectContaining({ type: 'invalid-payload' }) }));
    }
  });
});

describe('createOtpField with WebOTP', () => {
  function stubWebOtp(get: (options: { signal: AbortSignal }) => Promise<unknown>) {
    vi.stubGlobal('OTPCredential', function OTPCredential() {
      return undefined;
    });
    vi.stubGlobal('navigator', { userAgent: navigator.userAgent, credentials: { get } });
  }
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('fills the code from an SMS, and says so', async () => {
    stubWebOtp(() => Promise.resolve({ code: '482913' }));
    const { field, values, onComplete } = setup({ webOtp: true });
    expect(field.getSnapshot().webOtp).toBe('waiting');
    await flush();
    expect(values()).toBe('482913');
    expect(onComplete).toHaveBeenCalledWith('482913');
    expect(field.getSnapshot().webOtp).toBe('received');
  });

  it('stops waiting when the code is typed, or the boxes are detached', async () => {
    let signal: AbortSignal | undefined;
    stubWebOtp((options) => {
      signal = options.signal;
      return new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    });
    const typed = setup({ webOtp: true });
    type(typed.inputs[0] as HTMLInputElement, '482913');
    expect(signal?.aborted).toBe(true);
    expect(typed.field.getSnapshot().webOtp).toBe('aborted');
    await flush();
    expect(typed.field.getSnapshot().webOtp).toBe('aborted');

    const detached = setup({ webOtp: true });
    detached.detach();
    expect(detached.field.getSnapshot().webOtp).toBe('aborted');
    // Detaching twice does nothing more.
    detached.detach();
  });

  it('says when the browser has no WebOTP, or gives up', async () => {
    const none = setup({ webOtp: true });
    await flush();
    expect(none.field.getSnapshot().webOtp).toBe('unsupported');

    stubWebOtp(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
    const refused = setup({ webOtp: true });
    await flush();
    expect(refused.field.getSnapshot().webOtp).toBe('failed');

    stubWebOtp(() => Promise.resolve(null));
    const empty = setup({ webOtp: true });
    await flush();
    expect(empty.field.getSnapshot().webOtp).toBe('failed');
  });

  it('does not wait for an SMS once the code is already in', () => {
    const get = vi.fn(() => new Promise(() => undefined));
    stubWebOtp(get);
    const field = createOtpField({ webOtp: true, length: 4 });
    field.setValue('4829');
    field.attach(boxes(4));
    expect(get).not.toHaveBeenCalled();
    expect(field.getSnapshot().webOtp).toBe('idle');
  });
});
