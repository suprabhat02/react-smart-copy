import { copyFailure } from '../core/errors';
import type { TextPayload } from '../core/payload';
import { checkAddress } from './address';

/** An address to write: an `EmailAddress`, or any object with these fields. */
export interface AddressToWrite {
  readonly address: string;
  readonly name?: string | null;
}

/** Characters that make a name need quotes (RFC 5322 specials). */
const SPECIALS = /[()<>[\]:;@\\,."]/;

/**
 * One address as mail programs write it: `Ana Lima <ana@example.com>`, with the name in
 * quotes when it needs them (`"Lima, Ana" <ana@example.com>`), or the bare address. Line
 * breaks and other control characters in the name become spaces, so a name can never end a
 * mail header it is written into.
 *
 * @throws {CopyFailure} `invalid-payload` when `address` is not a valid e-mail address.
 */
export function formatAddress(address: AddressToWrite): string {
  if (typeof checkAddress(address.address, null) === 'string') {
    throw copyFailure('invalid-payload', `"${address.address.slice(0, 80)}" is not an e-mail address.`);
  }
  const name = (address.name ?? '').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (name === '') return address.address;
  return SPECIALS.test(name) ? `"${name.replace(/["\\]/g, '\\$&')}" <${address.address}>` : `${name} <${address.address}>`;
}

export interface AddressesPayloadOptions {
  /** Between addresses. Default `', '`, which Gmail, Outlook and Apple Mail all read. */
  readonly separator?: ', ' | '; ' | '\n';
}

/**
 * A copy payload for a list of recipients that pastes into the To field of any mail program,
 * names and all. Pass it to `copy()` or `useCopy`.
 *
 * @throws {CopyFailure} `invalid-payload` when one of the addresses is not valid.
 * @example
 * copy(addressesPayload(team.map((person) => ({ address: person.email, name: person.name }))));
 */
export function addressesPayload(addresses: readonly AddressToWrite[], options: AddressesPayloadOptions = {}): TextPayload {
  return { kind: 'text', value: addresses.map(formatAddress).join(options.separator ?? ', ') };
}
