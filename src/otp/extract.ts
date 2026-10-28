import { copyFailure } from '../core/errors';
import { normalizeOtpText, type OtpAlphabet } from './normalize';

/** Text past this many characters is not read: a code is near the start of a message. */
export const OTP_SCAN_LENGTH = 100_000;

export interface ExtractOtpOptions {
  /** The code's length, or its range. Default 4 to 8. */
  readonly length?: number | { readonly min: number; readonly max: number };
  /** Default `'numeric'`. Alphanumeric codes are upper case: pasted letters are made so. */
  readonly alphabet?: OtpAlphabet;
  /**
   * Your site's host name, as in `example.com`. An origin-bound message (`@example.com #123456`,
   * the format the WebOTP API reads) for another host gives no code: it was not meant for you.
   */
  readonly domain?: string;
}

/**
 * Where the code was found.
 *
 * - `whole-text`: the text is the code (`482913`, `482 913`, `482-913`).
 * - `origin-bound`: the message's last line binds it to a site (`@example.com #482913`).
 * - `keyword`: next to a word such as "code", "OTP", "verification" or "PIN", in any of
 *   many languages.
 * - `only-candidate`: the only number of the right length that is not a price, a date, a
 *   time, a phone number or an order number.
 */
export type OtpSource = 'whole-text' | 'origin-bound' | 'keyword' | 'only-candidate';

export interface OtpMatch {
  /** The code: ASCII digits (and upper-case letters, for alphanumeric codes), no separators. */
  readonly code: string;
  readonly source: OtpSource;
  /** `medium` for `only-candidate`; `high` otherwise. */
  readonly confidence: 'high' | 'medium';
  /** The site an origin-bound message names; `null` otherwise. */
  readonly domain: string | null;
}

interface Range {
  readonly min: number;
  readonly max: number;
}

function rangeOf(length: ExtractOtpOptions['length']): Range {
  const range = typeof length === 'number' ? { min: length, max: length } : (length ?? { min: 4, max: 8 });
  const valid = (value: number): boolean => Number.isInteger(value) && value >= 1 && value <= 32;
  if (!valid(range.min) || !valid(range.max) || range.min > range.max) {
    throw copyFailure('invalid-payload', 'length must be a whole number from 1 to 32, or a range of them.');
  }
  return range;
}

/**
 * Words next to a one-time code, lower case: English, Hindi, Spanish, Portuguese, French,
 * German, Italian, Dutch, Indonesian, Turkish, Polish, Russian, Ukrainian, Arabic, Hebrew,
 * Persian, Chinese, Japanese, Korean, Vietnamese and Thai.
 */
const KEYWORDS: readonly string[] = [
  'code', 'otp', 'one-time', 'one time', 'passcode', 'password', 'pin', 'verification', 'verify', 'security', 'login', 'log in',
  'sign-in', 'sign in', '2fa', 'two-factor', 'authentication', 'token',
  '\u0913\u091F\u0940\u092A\u0940', '\u0915\u094B\u0921', '\u0938\u0924\u094D\u092F\u093E\u092A\u0928',
  'c\u00F3digo', 'codigo', 'clave', 'contrase\u00F1a', 'senha', 'mot de passe', 'v\u00E9rification', 'best\u00E4tigungscode',
  'kennwort', 'codice', 'verificatie', 'kode', 'kod', 'do\u011Frulama', 'weryfikacyjny',
  '\u043A\u043E\u0434', '\u043F\u0430\u0440\u043E\u043B\u044C', '\u0440\u0430\u0437\u043E\u0432\u044B\u0439',
  '\u0631\u0645\u0632', '\u0643\u0648\u062F', '\u0627\u0644\u062A\u062D\u0642\u0642', '\u05E7\u05D5\u05D3', '\u06A9\u062F',
  '\u9A8C\u8BC1\u7801', '\u9A57\u8B49\u78BC', '\u6821\u9A8C\u7801', '\u52D5\u614B\u78BC', '\u8A8D\u8A3C\u30B3\u30FC\u30C9',
  '\u78BA\u8A8D\u30B3\u30FC\u30C9', '\u30EF\u30F3\u30BF\u30A4\u30E0', '\u8A8D\u8A3C\u756A\u53F7', '\uC778\uC99D\uBC88\uD638',
  '\uC778\uC99D', '\uCF54\uB4DC', 'm\u00E3', 'x\u00E1c th\u1EF1c', '\u0E23\u0E2B\u0E31\u0E2A',
];

/** Codes that are not one-time codes, right before a number: postal codes, coupons, orders. */
const NOT_OTP = /(?:pin ?code|zip|postal|post code|promo|coupon|discount|voucher|referral|order|invoice|ref\.?|account|a\/c|flight|pnr|room|tracking)[\s:#.-]{0,4}$/;

/** Currencies and units around a number: it is an amount, not a code. */
const CURRENCY_BEFORE = /(?:[$\u20AC\u00A3\u20B9\u00A5\u20A9\u20BD\u00A2]|\brs\.?|\binr|\busd|\beur|\bgbp)\s?$/;
const AMOUNT_AFTER = /^\s?(?:%|[$\u20AC\u00A3\u20B9\u00A5]|inr\b|usd\b|eur\b|rs\b|rupees\b|dollars\b|euros\b)/;

const NUMERIC = /(^|[^\p{L}\p{N}_])(\d{2,4}(?:[ -]\d{2,4}){1,3}|\d{1,12})(?![\p{L}\p{N}_])/gu;
const ALPHANUMERIC = /(^|[^\p{L}\p{N}_])([A-Z0-9]{2,6}(?:-[A-Z0-9]{2,6}){1,3}|[A-Z0-9]{1,12})(?![\p{L}\p{N}_])/gu;

const isDigit = (char: string | undefined): boolean => char !== undefined && char >= '0' && char <= '9';

/**
 * Whether the number at `start`-`end` is something else: part of a longer number (a phone
 * number), a date, a time or a decimal, an amount, an order or reference number, or inside
 * a URL or an e-mail address.
 */
function excluded(text: string, lower: string, start: number, end: number): boolean {
  const before = text[start - 1];
  const after = text[end];
  if ((before === ' ' || before === '-') && isDigit(text[start - 2])) return true;
  if ((after === ' ' || after === '-') && isDigit(text[end + 1])) return true;
  // A time, a date, a decimal or a version (`10:30`, `23/10`, `3.14`), and thousands (`2,500`).
  if (before !== undefined && ':/.'.includes(before) && isDigit(text[start - 2])) return true;
  if (after !== undefined && ':/.'.includes(after) && isDigit(text[end + 1])) return true;
  if ((before === ',' && isDigit(text[start - 2]) && /^\d{3}(?!\d)/.test(text.slice(start, start + 4))) || /^,\d{3}(?!\d)/.test(text.slice(end, end + 5))) return true;
  if (before === '+' || before === '#' || before === '(' || (before === ' ' && text[start - 2] === ')')) return true;
  const head = lower.slice(Math.max(0, start - 24), start);
  if (CURRENCY_BEFORE.test(head) || NOT_OTP.test(head) || AMOUNT_AFTER.test(lower.slice(end, end + 10))) return true;
  // The word around it, between white space (up to 256 characters each way, so a scan stays
  // linear): a URL, with a scheme or a bare host and path (`example.com/t/48291`), or an
  // e-mail address holds no code.
  let from = start;
  while (from > Math.max(0, start - 256) && !/\s/.test(text[from - 1] as string)) from -= 1;
  let to = end;
  while (to < Math.min(text.length, end + 256) && !/\s/.test(text[to] as string)) to += 1;
  return /@|:\/\/|www\.|[\p{L}\p{N}-]\.\p{L}{2,}\//iu.test(text.slice(from, to));
}

/** Lower case, one character for one: positions in it are positions in `text`. */
function lowerSameLength(text: string): string {
  let out = '';
  for (const char of text) {
    const lower = char.toLowerCase();
    out += lower.length === char.length ? lower : char;
  }
  return out;
}

/** Where a keyword is in the text: its first character, and the one after its last. */
interface KeywordAt {
  readonly from: number;
  readonly to: number;
}

/**
 * Every keyword in `lower`, by position. Found once for the whole text, so each number's
 * nearest keyword is a short look among its neighbours, not a new search.
 */
function keywordsIn(lower: string): KeywordAt[] {
  const found: KeywordAt[] = [];
  for (const keyword of KEYWORDS) {
    // Words in Latin script count only as whole words: `pin` is not in `spinning`.
    const whole = /^[a-z0-9 -]+$/.test(keyword);
    for (let at = lower.indexOf(keyword); at !== -1; at = lower.indexOf(keyword, at + 1)) {
      if (whole && (/[a-z]/.test(lower.charAt(at - 1)) || /[a-z]/.test(lower.charAt(at + keyword.length)))) continue;
      found.push({ from: at, to: at + keyword.length });
    }
  }
  return found.sort((a, b) => a.from - b.from);
}

/** The index of the first keyword that starts at or after `position` (binary search). */
function firstFrom(keywords: readonly KeywordAt[], position: number): number {
  let low = 0;
  let high = keywords.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((keywords[middle] as KeywordAt).from < position) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * The distance from the number at `start`-`end` to the nearest keyword within 60 characters
 * before it or 40 after it: words before count closer.
 */
function keywordDistance(keywords: readonly KeywordAt[], start: number, end: number): number {
  const windowEnd = end + 40;
  let best = Infinity;
  for (let index = firstFrom(keywords, start - 60); index < keywords.length; index += 1) {
    const { from, to } = keywords[index] as KeywordAt;
    if (from >= windowEnd) break;
    if (to > windowEnd) continue;
    // A keyword inside the number itself (as in `otp` of an alphanumeric code) does not count.
    if (to <= start) best = Math.min(best, start - to);
    else if (from >= end) best = Math.min(best, from - end + 10);
  }
  return best;
}

/** The origin-bound line of the WebOTP format: `@host #code`, last in the message. */
const ORIGIN_BOUND = /(?:^|\n)@([a-z0-9.-]{1,253}(?::\d{1,5})?) #([A-Za-z0-9]{1,32})(?: @[a-z0-9.-]{1,253}(?::\d{1,5})?)?[ \t]*$/i;

/**
 * The one-time code in `text`: an SMS or e-mail people paste, or a code they copied. Digits
 * of any script and full-width characters are read as ASCII, and separators are dropped
 * (`482 913`, `482-913`).
 *
 * Prices, dates, times, phone numbers, order numbers and postal codes are never taken for a
 * code. When several numbers could be the code and no keyword points at one, the result is
 * `null`: guessing would fill in a wrong code.
 *
 * @throws {CopyFailure} `invalid-payload` for a `length` that is not 1 to 32, or a reversed range.
 */
export function extractOtp(text: string, options: ExtractOtpOptions = {}): OtpMatch | null {
  const range = rangeOf(options.length);
  const alphabet = options.alphabet ?? 'numeric';
  const fits = (code: string): boolean => code.length >= range.min && code.length <= range.max && (alphabet === 'alphanumeric' || /^\d+$/.test(code));
  const normalized = normalizeOtpText(text.slice(0, OTP_SCAN_LENGTH), alphabet);

  // The text is the code itself.
  const whole = normalized.trim();
  if (/^[0-9A-Z]{1,32}(?:[ -][0-9A-Z]{1,32}){0,7}$/.test(whole)) {
    const code = whole.replace(/[ -]/g, '');
    if (fits(code)) return { code, source: 'whole-text', confidence: 'high', domain: null };
  }

  // A message bound to a site, in the format the WebOTP API reads.
  // Read with its case kept: host names are lower case, and an alphanumeric code is upper-cased after.
  const bound = ORIGIN_BOUND.exec(normalizeOtpText(text.slice(0, OTP_SCAN_LENGTH), 'numeric').trimEnd());
  if (bound !== null) {
    const domain = (bound[1] as string).toLowerCase();
    const code = (bound[2] as string).toUpperCase();
    if (options.domain !== undefined && options.domain.toLowerCase() !== domain) return null;
    if (fits(code)) return { code, source: 'origin-bound', confidence: 'high', domain };
  }

  const lower = lowerSameLength(normalized);
  const pattern = alphabet === 'numeric' ? NUMERIC : ALPHANUMERIC;
  const keywords = keywordsIn(lower);
  const candidates: { readonly code: string; readonly distance: number }[] = [];
  for (const match of normalized.matchAll(pattern)) {
    const raw = match[2] as string;
    const start = match.index + (match[1] as string).length;
    const code = raw.replace(/[ -]/g, '');
    if (!fits(code) || (alphabet === 'alphanumeric' && !/\d/.test(code)) || excluded(normalized, lower, start, start + raw.length)) continue;
    candidates.push({ code, distance: keywordDistance(keywords, start, start + raw.length) });
  }
  const near = candidates.filter((candidate) => candidate.distance <= 60);
  if (near.length > 0) {
    const best = near.reduce((a, b) => (b.distance < a.distance ? b : a));
    return { code: best.code, source: 'keyword', confidence: 'high', domain: null };
  }
  const distinct = new Set(candidates.map((candidate) => candidate.code));
  return distinct.size === 1 ? { code: [...distinct][0] as string, source: 'only-candidate', confidence: 'medium', domain: null } : null;
}
