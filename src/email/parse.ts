import { copyFailure } from '../core/errors';
import { checkAddress, type EmailAddress, type InvalidAddressReason } from './address';

/** Text that was not an address, and why. */
export interface InvalidAddress {
  /** The text, as it was pasted (at most 256 characters of it). */
  readonly text: string;
  readonly reason: InvalidAddressReason;
}

/** The addresses in a pasted list of recipients. */
export interface AddressList {
  /** The valid addresses, in order, each once. */
  readonly addresses: readonly EmailAddress[];
  /** The entries that were not addresses, in order. */
  readonly invalid: readonly InvalidAddress[];
  /** How many addresses were left out because they came earlier in the list. */
  readonly duplicates: number;
  /** The text held more than `maxAddresses` entries, or more than {@link ADDRESS_LIST_MAX_LENGTH} characters: the rest was not read. */
  readonly truncated: boolean;
}

export interface ParseAddressesOptions {
  /** Read at most this many entries (valid or not). Default 1000. */
  readonly maxAddresses?: number;
  /** Leave out addresses that came earlier in the list (compared without case). Default `true`. */
  readonly dedupe?: boolean;
  /**
   * Accept only addresses at these domains or their subdomains (`['example.com']` takes
   * `ana@example.com` and `ana@mail.example.com`). Others are `invalid` with `'not-allowed'`.
   */
  readonly domains?: readonly string[];
}

/** Longer text is cut here: no list of recipients is this long. */
export const ADDRESS_LIST_MAX_LENGTH = 100_000;
const MAX_NAME_LENGTH = 256;
/** An entry longer than this is no address with its name: it is not read. */
const MAX_ENTRY_LENGTH = 1024;

interface Segment {
  text: string;
  /** The separator before it: `''` for the first. */
  readonly separator: string;
}

/**
 * Splits the text at commas, semicolons, line breaks and tabs, but not inside quotes,
 * angle brackets or parentheses: `"Lima, Ana" <ana@example.com>` stays one entry.
 */
function split(text: string): Segment[] {
  const segments: Segment[] = [];
  let current = '';
  let separator = '';
  let quoted = false;
  let angle = 0;
  let paren = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (quoted) {
      current += char;
      if (char === '\\' && index + 1 < text.length) {
        index += 1;
        current += text.charAt(index);
      } else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '<') angle += 1;
    else if (char === '>') angle = Math.max(0, angle - 1);
    else if (char === '(') paren += 1;
    else if (char === ')') paren = Math.max(0, paren - 1);
    else if (angle === 0 && paren === 0 && /[,;\n\t]/.test(char)) {
      segments.push({ text: current, separator });
      current = '';
      separator = char;
      continue;
    }
    current += char;
  }
  segments.push({ text: current, separator });
  return segments;
}

/** `text` with what is inside double quotes blanked out, at the same length. */
function unquoted(text: string): string {
  return text.replace(/"(?:\\.|[^"\\])*"?/g, (quoted) => '_'.repeat(quoted.length));
}

/**
 * Joins names to the address they belong to. Outlook writes `Lima, Ana <ana@example.com>`
 * with an unquoted comma, so names before a comma join an entry in angle brackets. A
 * spreadsheet row puts names in the cells around the address, so cells of one row (tabs)
 * join it, before or after. A line break starts a new row. Names that join nothing are
 * entries of their own, and not addresses.
 */
function join(segments: readonly Segment[]): string[] {
  const entries: string[] = [];
  let names: Segment[] = [];
  /** The last entry is an address on this row, which cells after it can name. */
  let rowAddress = false;
  const flush = (): void => {
    entries.push(...names.map((name) => name.text));
    names = [];
  };
  for (const segment of segments) {
    const { separator } = segment;
    if (separator === '\n') {
      flush();
      rowAddress = false;
    }
    const text = unquoted(segment.text);
    if (text.trim() === '') {
      // An empty cell or a doubled separator ends a name.
      flush();
    } else if (!text.includes('@')) {
      if (rowAddress && separator === '\t') entries.push(`${String(entries.pop())}\t${segment.text}`);
      else {
        rowAddress = false;
        names.push(segment);
      }
    } else {
      // The names right before the address, joined to it by its own separator, belong to it.
      let from = names.length;
      if (separator === '\t' || (separator === ',' && text.includes('<'))) {
        from = Math.max(0, from - 1);
        while (from > 0 && names[from]?.separator === separator) from -= 1;
      }
      const own = names.slice(from);
      names = names.slice(0, from);
      flush();
      entries.push([...own, segment].map((part, index) => (index === 0 ? part.text : part.separator + part.text)).join(''));
      names = [];
      rowAddress = true;
    }
  }
  flush();
  return entries.map((entry) => entry.trim()).filter((entry) => entry !== '');
}

/** A name as people wrote it: quotes taken off, no control characters, spaces collapsed. */
function cleanName(raw: string, address: string): string | null {
  let name = raw.trim();
  if (/^"(?:\\.|[^"\\])*"$/.test(name)) name = name.slice(1, -1).replace(/\\(.)/g, '$1');
  else if (/^'[^']*'$/.test(name)) name = name.slice(1, -1);
  // Control and format characters (line breaks among them) never belong in a name: they could
  // end a mail header the name is written into.
  name = name.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH).trim();
  return name === '' || name.toLowerCase() === address.toLowerCase() ? null : name;
}

/** The address part of an entry, without `mailto:` or a query. */
function addressPart(text: string): string {
  const trimmed = text.trim();
  return /^mailto:/i.test(trimmed) ? String(trimmed.slice(7).split('?')[0]) : trimmed;
}

/** One entry as an address and the name written with it, or `null` when it is shaped like neither. */
function readEntry(entry: string): { readonly address: string; readonly name: string } | null {
  const strip = unquoted(entry);
  const open = strip.indexOf('<');
  if (open !== -1) {
    // `Name <address>`: one pair of angle brackets, last.
    const close = strip.indexOf('>', open);
    if (close === -1 || strip.indexOf('<', open + 1) !== -1 || strip.slice(close + 1).trim() !== '') return null;
    return { address: addressPart(entry.slice(open + 1, close)), name: entry.slice(0, open) };
  }
  // `address (Name)`, an old form some systems still write.
  const paren = strip.indexOf('(');
  if (paren !== -1) {
    const address = entry.slice(0, paren).trim();
    const name = entry.slice(paren + 1, -1);
    return strip.endsWith(')') && !/[\s()]/.test(address) && !/[()]/.test(name) ? { address: addressPart(address), name } : null;
  }
  // `Name address` or `address Name`, as contact cards and spreadsheet rows have them.
  const words = entry.split(/\s+/);
  const at = words.filter((word) => word.includes('@'));
  if (at.length !== 1) return null;
  const address = String(at[0]);
  const index = words.indexOf(address);
  if (index !== 0 && index !== words.length - 1) return null;
  return { address: addressPart(address), name: words.filter((_, position) => position !== index).join(' ') };
}

/** Whether `address` is at one of `domains` (ASCII forms) or a subdomain of one. */
function isAllowed(address: string, domains: readonly string[]): boolean {
  const domain = address.slice(address.lastIndexOf('@') + 1);
  return domains.some((one) => domain === one || domain.endsWith(`.${one}`));
}

/** `domain` in its ASCII form, for comparing; throws for one that is not a domain. */
function allowedDomain(domain: string): string {
  const checked = checkAddress(`x@${domain}`, null);
  if (typeof checked === 'string') throw copyFailure('invalid-payload', `"${domain.slice(0, 80)}" is not a domain.`);
  return checked.address.slice(2);
}

/**
 * Reads the e-mail addresses in a pasted list of recipients, as Outlook, Gmail, Apple Mail,
 * contact cards and spreadsheet columns copy them:
 *
 * - separated by commas, semicolons, line breaks or tabs;
 * - `ana@example.com`, `Ana Lima <ana@example.com>`, `"Lima, Ana" <ana@example.com>`,
 *   Outlook's unquoted `Lima, Ana <ana@example.com>`, `ana@example.com (Ana Lima)`,
 *   `mailto:` links, and a name in the cell before the address;
 * - international domains and local parts, and full-width characters.
 *
 * Each address is checked: its local part, a domain that can exist (`localhost`, `a.b-` and
 * IP addresses can't), lengths, and characters that hide what an address really is. Domains
 * that mix scripts are flagged as `lookalike`.
 *
 * @throws {CopyFailure} `invalid-payload` for a `maxAddresses` that is not a positive whole
 * number, or a `domains` entry that is not a domain.
 * @example
 * parseAddresses('Lima, Ana <ana@example.com>; bo@example.org, not an address');
 * // addresses: [{ address: 'ana@example.com', name: 'Lima, Ana', ... }, { address: 'bo@example.org', name: null, ... }]
 * // invalid: [{ text: 'not an address', reason: 'syntax' }]
 */
export function parseAddresses(text: string, options: ParseAddressesOptions = {}): AddressList {
  const max = options.maxAddresses ?? 1000;
  if (!(Number.isInteger(max) && max > 0)) throw copyFailure('invalid-payload', `maxAddresses must be a positive whole number, not ${String(max)}.`);
  const allowed = options.domains?.map(allowedDomain);
  // A byte order mark at the start, as some programs copy it, is not part of the first entry.
  const input = text.slice(0, ADDRESS_LIST_MAX_LENGTH).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').normalize('NFKC');
  const entries = join(split(input));
  const truncated = text.length > ADDRESS_LIST_MAX_LENGTH || entries.length > max;
  const addresses: EmailAddress[] = [];
  const invalid: InvalidAddress[] = [];
  const seen = new Map<string, number>();
  let duplicates = 0;
  for (const entry of entries.slice(0, max)) {
    const read = entry.length > MAX_ENTRY_LENGTH ? null : readEntry(entry);
    const checked = entry.length > MAX_ENTRY_LENGTH ? 'too-long' : read === null ? 'syntax' : checkAddress(read.address, cleanName(read.name, read.address));
    const reason = typeof checked === 'string' ? checked : allowed !== undefined && !isAllowed(checked.address, allowed) ? 'not-allowed' : null;
    if (typeof checked === 'string' || reason !== null) {
      invalid.push({ text: entry.slice(0, MAX_NAME_LENGTH), reason: reason as InvalidAddressReason });
      continue;
    }
    const address = checked;
    const key = address.address.toLowerCase();
    const earlier = options.dedupe === false ? undefined : seen.get(key);
    if (earlier === undefined) {
      seen.set(key, addresses.length);
      addresses.push(address);
      continue;
    }
    duplicates += 1;
    // The first mention wins, but a name given later fills one it lacked.
    const first = addresses[earlier] as EmailAddress;
    if (first.name === null && address.name !== null) addresses[earlier] = { ...first, name: address.name };
  }
  return { addresses, invalid, duplicates, truncated };
}

/**
 * Reads one e-mail address, with or without a name (`Ana Lima <ana@example.com>`), for a
 * single-address field. `null` when the text is not exactly one valid address.
 */
export function parseAddress(text: string): EmailAddress | null {
  const list = parseAddresses(text, { maxAddresses: 2 });
  return list.addresses.length === 1 && list.invalid.length === 0 && list.duplicates === 0 ? (list.addresses[0] as EmailAddress) : null;
}
