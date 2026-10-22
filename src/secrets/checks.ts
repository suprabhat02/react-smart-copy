/** Checks that tell real secrets from look-alikes: checksums, structure and randomness. */

/** The Luhn checksum of card numbers. `digits` holds only digits. */
export function luhn(digits: string): boolean {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = digits.charCodeAt(digits.length - 1 - index) - 48;
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** Card brands by their number ranges (IIN) and lengths. */
const BRANDS: readonly { readonly prefix: RegExp; readonly lengths: readonly number[] }[] = [
  { prefix: /^4/, lengths: [13, 16, 19] }, // Visa
  { prefix: /^(?:5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)/, lengths: [16] }, // Mastercard
  { prefix: /^3[47]/, lengths: [15] }, // American Express
  { prefix: /^(?:6011|65|64[4-9])/, lengths: [16, 17, 18, 19] }, // Discover
  { prefix: /^35(?:2[89]|[3-8]\d)/, lengths: [16, 17, 18, 19] }, // JCB
  { prefix: /^3(?:0[0-5]|[689])/, lengths: [14, 15, 16, 17, 18, 19] }, // Diners Club
  { prefix: /^62/, lengths: [16, 17, 18, 19] }, // UnionPay
];

/**
 * Whether `candidate` is a card number: a known brand's range and length, a valid Luhn
 * checksum, and separators (spaces or dashes) used the way cards print them: none, or one
 * kind in groups of 4 (Amex: 4-6-5).
 */
export function isCardNumber(candidate: string): boolean {
  const digits = candidate.replace(/[ -]/g, '');
  const separators = new Set(candidate.replace(/\d/g, ''));
  if (separators.size > 1) return false;
  if (separators.size === 1) {
    const groups = candidate.split(/[ -]/).map((group) => group.length);
    const fours = groups.slice(0, -1).every((length) => length === 4) && (groups[groups.length - 1] as number) <= 4;
    const amex = groups.join('-') === '4-6-5';
    if (!fours && !amex) return false;
  }
  if (/^(\d)\1+$/.test(digits)) return false;
  return BRANDS.some((brand) => brand.prefix.test(digits) && brand.lengths.includes(digits.length)) && luhn(digits);
}

/** IBAN lengths by country (ISO 13616 registry), for the countries that use one. */
const IBAN_LENGTHS: Readonly<Record<string, number>> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24,
  DE: 22, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28,
  HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20,
  LV: 21, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29,
  RO: 24, RS: 22, SA: 24, SC: 31, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28, TL: 23, TN: 24, TR: 26, UA: 29, VA: 22,
  VG: 24, XK: 20,
};

/** Whether `candidate` (spaces allowed) is an IBAN: its country's length and a valid mod-97 checksum. */
export function isIban(candidate: string): boolean {
  const iban = candidate.replace(/ /g, '');
  if (IBAN_LENGTHS[iban.slice(0, 2)] !== iban.length) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const code = char.charCodeAt(0);
    // Letters count as two digits (A = 10 ... Z = 35); digits as themselves.
    const value = code >= 65 ? code - 55 : code - 48;
    remainder = (value > 9 ? remainder * 100 + value : remainder * 10 + value) % 97;
  }
  return remainder === 1;
}

/** Shannon entropy of `text`, in bits per character. */
export function entropy(text: string): number {
  const counts = new Map<string, number>();
  for (const char of text) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / text.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/** Values that stand in for a secret in examples and templates, never a secret themselves. */
const PLACEHOLDER =
  /^(?:x+|\*+|\.+|-+|_+|#+|0+|<[^>]*>|\[[^\]]*\]|\$\{[^}]*\}|\{\{[^}]*\}\}|%[^%]*%|\$[A-Z_][A-Z0-9_]*|your[_-]?[\w-]*|my[_-][\w-]*|change[_-]?me|example[\w-]*|sample[\w-]*|dummy[\w-]*|fake[\w-]*|placeholder[\w-]*|redacted|null|none|undefined)$/i;

/** A reference to another value, not a value: `process.env.TOKEN`, `config.api.key`. */
const REFERENCE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/;

/** Whether `value` looks like a real secret: random enough, and not a placeholder or a reference. */
export function looksSecret(value: string, minEntropy: number): boolean {
  return !PLACEHOLDER.test(value) && !REFERENCE.test(value) && entropy(value) >= minEntropy;
}

/** Whether the first part of a JWT decodes to a JSON header with an algorithm. */
export function isJwtHeader(part: string): boolean {
  if (typeof atob !== 'function') return true;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const header: unknown = JSON.parse(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)));
    return typeof header === 'object' && header !== null && typeof (header as { alg?: unknown }).alg === 'string';
  } catch {
    return false;
  }
}
