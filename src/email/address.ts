/** An e-mail address read from text. */
export interface EmailAddress {
  /**
   * The address to send to: the local part as written, the domain in lower case and, for an
   * international domain, in its ASCII form (`ana@xn--bcher-kva.de`). Compare and store this.
   */
  readonly address: string;
  /** The same address with the domain as people read it (`ana@b\u00FCcher.de`). Show this. */
  readonly display: string;
  /** The name written with it (`Ana Lima` in `Ana Lima <ana@example.com>`), or `null`. */
  readonly name: string | null;
  /**
   * The domain mixes Latin letters with Cyrillic or Greek ones that look like them, as in
   * `ex\u0430mple.com` with a Cyrillic `\u0430`: a lookalike of another domain. Warn before sending.
   */
  readonly lookalike: boolean;
}

/** Why text was not an e-mail address. */
export type InvalidAddressReason =
  /** Not shaped like an address: no `@`, two of them, spaces, or characters an address can't have. */
  | 'syntax'
  /** The part after `@` is not a domain names can be registered under. */
  | 'domain'
  /** Longer than an address can be: 64 characters before `@`, 254 in all. */
  | 'too-long'
  /** Holds invisible or direction-changing characters: often a way to disguise an address. */
  | 'invisible'
  /** A valid address, at a domain `domains` does not allow. */
  | 'not-allowed';

/** Invisible and direction-changing characters, soft hyphens and variation selectors. */
export const INVISIBLE: RegExp = /[\u00AD\u061C\u115F\u1160\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFEFF\uFFA0]|\u034F|\u17B4|\u17B5|\p{Variation_Selector}/u;

/** A dot-atom local part (RFC 5322), with letters of any script (RFC 6531). */
const LOCAL = /^[\p{L}\p{M}\p{N}!#$%&'*+/=?^_`{|}~-]+(?:\.[\p{L}\p{M}\p{N}!#$%&'*+/=?^_`{|}~-]+)*$/u;
/** Characters that change how a URL host is read: not part of any domain. */
const NOT_DOMAIN = /[\s/?#@:[\]\\%<>"'(),;]/u;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
/** A top-level domain: letters, or an international one in its ASCII form. */
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const LATIN = /\p{Script=Latin}/u;
const LOOKALIKE_SCRIPT = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;

/** The domain in its ASCII form, lower case, or `null` when it is not one. */
function asciiDomain(domain: string): string | null {
  if (NOT_DOMAIN.test(domain)) return null;
  let host: string;
  try {
    // The URL parser applies IDNA (UTS #46): case, full-width forms and international labels.
    host = new URL(`http://${domain}`).hostname;
  } catch {
    return null;
  }
  const labels = host.split('.');
  if (host.length > 253 || labels.length < 2 || !labels.every((label) => LABEL.test(label))) return null;
  return TLD.test(String(labels[labels.length - 1])) ? host : null;
}

/** Whether a label of `domain` mixes Latin letters with lookalike Cyrillic or Greek ones. */
function isLookalike(domain: string): boolean {
  return domain.split('.').some((label) => LATIN.test(label) && LOOKALIKE_SCRIPT.test(label));
}

/**
 * Checks one address (`local@domain`, nothing around it) and gives it in its forms, or the
 * reason it is not one. Quoted local parts (`"ana lima"@example.com`) and IP literals
 * (`ana@[192.0.2.1]`) are not accepted: mail systems and people rarely use them, and they
 * are a common way to slip past checks.
 */
export function checkAddress(text: string, name: string | null): EmailAddress | InvalidAddressReason {
  if (INVISIBLE.test(text)) return 'invisible';
  // Full-width `\uFF20` and letters, as some keyboards type them.
  const normalized = text.normalize('NFKC');
  const at = normalized.lastIndexOf('@');
  if (at === -1) return 'syntax';
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (!LOCAL.test(local) || domain === '') return 'syntax';
  if (local.length > 64) return 'too-long';
  const ascii = asciiDomain(domain);
  if (ascii === null) return 'domain';
  const address = `${local}@${ascii}`;
  if (address.length > 254) return 'too-long';
  // As people read it: ideographic full stops (`\u3002`) are dots, as IDNA reads them.
  const unicode = domain.normalize('NFC').toLowerCase().replace(/\u3002/g, '.');
  return { address, display: `${local}@${unicode}`, name, lookalike: isLookalike(unicode) };
}
