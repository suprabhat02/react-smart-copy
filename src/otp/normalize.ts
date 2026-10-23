/** What a one-time code is made of. */
export type OtpAlphabet = 'numeric' | 'alphanumeric';

/**
 * Code points of zero in the decimal digit sets people receive codes in: Arabic-Indic,
 * Persian, Devanagari, Bengali, Gurmukhi, Gujarati, Oriya, Tamil, Telugu, Kannada,
 * Malayalam, Thai, Lao, Tibetan, Myanmar and Khmer. Full-width digits are handled by NFKC.
 */
const ZEROS: readonly number[] = [
  0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0x0e50, 0x0ed0, 0x0f20, 0x1040, 0x17e0,
];

/** `char` as an ASCII digit, when it is a digit of one of {@link ZEROS}' sets. */
function asciiDigit(char: string): string {
  const code = char.charCodeAt(0);
  for (const zero of ZEROS) {
    if (code >= zero && code <= zero + 9) return String(code - zero);
  }
  return char;
}

/**
 * `text` with its digits in ASCII and, for alphanumeric codes, its letters in upper case:
 * full-width digits and letters, and Arabic-Indic, Devanagari and other scripts' digits,
 * become ASCII. Other characters are kept: callers decide what to drop.
 */
export function normalizeOtpText(text: string, alphabet: OtpAlphabet): string {
  const ascii = text.normalize('NFKC').replace(/[\u0080-\uffff]/g, asciiDigit);
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
