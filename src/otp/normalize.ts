import { asciiDigits } from '../core/digits';

/** What a one-time code is made of. */
export type OtpAlphabet = 'numeric' | 'alphanumeric';

/**
 * `text` with its digits in ASCII and, for alphanumeric codes, its letters in upper case:
 * full-width digits and letters, and Arabic-Indic, Devanagari and other scripts' digits,
 * become ASCII. Other characters are kept: callers decide what to drop.
 */
export function normalizeOtpText(text: string, alphabet: OtpAlphabet): string {
  const ascii = asciiDigits(text);
  return alphabet === 'alphanumeric' ? ascii.toUpperCase() : ascii;
}

/** Whether `char` (already normalized) can be part of a code. */
export function isOtpChar(char: string, alphabet: OtpAlphabet): boolean {
  return alphabet === 'numeric' ? char >= '0' && char <= '9' && char.length === 1 : /^[0-9A-Z]$/.test(char);
}

/** The characters of `text` that can be part of a code, normalized, in order. */
export function otpChars(text: string, alphabet: OtpAlphabet): string[] {
  return Array.from(normalizeOtpText(text, alphabet)).filter((char) => isOtpChar(char, alphabet));
}
