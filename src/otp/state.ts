import { extractOtp } from './extract';
import { otpChars, type OtpAlphabet } from './normalize';

/** The characters in each box ('' for an empty one), and the box to focus next. */
export interface OtpStep {
  readonly chars: readonly string[];
  /** The box to focus after the change. */
  readonly focus: number;
}

export interface OtpSettings {
  readonly length: number;
  readonly alphabet: OtpAlphabet;
}

/** Keys a code field handles itself. */
export type OtpKey = 'Backspace' | 'Delete' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

export const emptyChars = (length: number): readonly string[] => Array.from({ length }, () => '');

const clamp = (index: number, length: number): number => Math.min(Math.max(index, 0), length - 1);

/** `chars` with `text`'s characters written from `index` on, as far as they fit. */
function write(chars: readonly string[], index: number, text: readonly string[], settings: OtpSettings): OtpStep {
  const next = [...chars];
  // A whole code (an SMS autofill into one box, a paste) fills the field from the start.
  const from = text.length >= settings.length ? 0 : clamp(index, settings.length);
  const count = Math.min(text.length, settings.length - from);
  for (let offset = 0; offset < count; offset += 1) next[from + offset] = text[offset] as string;
  return { chars: next, focus: clamp(from + count, settings.length) };
}

/**
 * What typing (or an autofill, or an input method) does to box `index`, whose value went
 * from `previous` to `value`. A character typed next to the one already there replaces it;
 * several characters fill the boxes after it; characters a code can't have are ignored.
 */
export function inputStep(chars: readonly string[], index: number, previous: string, value: string, settings: OtpSettings): OtpStep {
  let typed = value;
  // One character added beside the one the box held: the new one is what was typed.
  if (previous !== '' && value.length === previous.length + 1) {
    if (value.startsWith(previous)) typed = value.slice(previous.length);
    else if (value.endsWith(previous)) typed = value.slice(0, value.length - previous.length);
  }
  const text = otpChars(typed, settings.alphabet);
  if (text.length > 0) return write(chars, index, text, settings);
  if (value === '') {
    // The box was emptied (a cut, or a delete the browser did itself).
    const next = [...chars];
    next[index] = '';
    return { chars: next, focus: index };
  }
  return { chars, focus: index };
}

/** What pasting `text` into box `index` does: the code in it fills the field, wherever it is pasted. */
export function pasteStep(chars: readonly string[], index: number, text: string, settings: OtpSettings): OtpStep {
  const match = extractOtp(text, { length: settings.length, alphabet: settings.alphabet });
  if (match !== null) return write(chars, 0, Array.from(match.code), settings);
  const typed = otpChars(text, settings.alphabet);
  return typed.length > 0 && typed.length < settings.length ? write(chars, index, typed, settings) : { chars, focus: index };
}

/** What a navigation or deletion key does in box `index`. */
export function keyStep(chars: readonly string[], index: number, key: OtpKey, settings: OtpSettings): OtpStep {
  const last = settings.length - 1;
  switch (key) {
    case 'Backspace': {
      const next = [...chars];
      // An empty box: the one before it is cleared, as if the cursor were between them.
      const target = chars[index] === '' ? Math.max(0, index - 1) : index;
      next[target] = '';
      return { chars: next, focus: target };
    }
    case 'Delete': {
      const next = [...chars];
      next[index] = '';
      return { chars: next, focus: index };
    }
    case 'ArrowLeft':
      return { chars, focus: Math.max(0, index - 1) };
    case 'ArrowRight':
      return { chars, focus: Math.min(last, index + 1) };
    case 'Home':
      return { chars, focus: 0 };
    case 'End': {
      const empty = chars.indexOf('');
      return { chars, focus: empty === -1 ? last : empty };
    }
  }
}

/** A whole code set at once (from WebOTP, or by the app): its characters from the first box. */
export function setStep(code: string, settings: OtpSettings): OtpStep {
  return write(emptyChars(settings.length), 0, otpChars(code, settings.alphabet).slice(0, settings.length), settings);
}
