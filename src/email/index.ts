/**
 * `react-smart-copy/email`
 *
 * E-mail addresses, pasted and copied the way mail programs do: lists of recipients from
 * Outlook, Gmail, Apple Mail, contact cards and spreadsheet columns, with names, read into
 * checked addresses; lookalike domains and hidden characters caught; lists written back so
 * they paste into any To field. Free of dependencies, and safe on servers.
 *
 * - {@link parseAddresses}: the addresses in a pasted list, and what was not one.
 * - {@link parseAddress}: one address, for a single-address field.
 * - {@link pasteAddresses}: a paste handler for recipient fields.
 * - {@link formatAddress} and {@link addressesPayload}: write and copy addresses with names.
 *
 * @module
 */

export { parseAddress, parseAddresses, ADDRESS_LIST_MAX_LENGTH, type AddressList, type InvalidAddress, type ParseAddressesOptions } from './parse';
export type { EmailAddress, InvalidAddressReason } from './address';
export { addressesPayload, formatAddress, type AddressesPayloadOptions, type AddressToWrite } from './format';
export { pasteAddresses, type AddressPasteEvent, type AddressPasteOutcome, type PasteAddressesOptions } from './paste';
