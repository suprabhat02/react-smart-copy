/**
 * Digits of other scripts as ASCII, shared by the opt-in entry points that read numbers.
 * Internal: not part of `react-smart-copy/core`'s public API.
 */

/**
 * Code points of zero in the decimal digit sets people write numbers in: Arabic-Indic,
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
 * `text` in NFKC (full-width digits, letters and signs as ASCII, no-break spaces as spaces)
 * with the digits of other scripts as ASCII. Other characters are kept.
 */
export function asciiDigits(text: string): string {
  return text.normalize('NFKC').replace(/[\u0080-\uffff]/g, asciiDigit);
}
