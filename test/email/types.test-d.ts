import type { ClipboardEvent as ReactClipboardEvent } from 'react';
import { describe, expectTypeOf, it } from 'vitest';
import type { TextPayload } from '../../src/core';
import {
  addressesPayload,
  formatAddress,
  parseAddress,
  parseAddresses,
  pasteAddresses,
  type AddressList,
  type AddressPasteOutcome,
  type EmailAddress,
  type InvalidAddressReason,
} from '../../src/email';

declare const reactPaste: ReactClipboardEvent<HTMLInputElement>;
declare const domPaste: ClipboardEvent;

describe('email types', () => {
  it('parses and formats', () => {
    expectTypeOf(parseAddresses('x', { maxAddresses: 10, dedupe: false, domains: ['example.com'] })).toEqualTypeOf<AddressList>();
    expectTypeOf<AddressList['addresses'][number]>().toEqualTypeOf<EmailAddress>();
    expectTypeOf<AddressList['invalid'][number]['reason']>().toEqualTypeOf<InvalidAddressReason>();
    expectTypeOf(parseAddress('x')).toEqualTypeOf<EmailAddress | null>();
    expectTypeOf(formatAddress({ address: 'a@example.com', name: null })).toEqualTypeOf<string>();
    expectTypeOf(addressesPayload([], { separator: '; ' })).toEqualTypeOf<TextPayload>();
    // An EmailAddress can be written back as it is.
    expectTypeOf(formatAddress).toBeCallableWith({} as EmailAddress);
    // @ts-expect-error: not a separator mail programs read
    void addressesPayload([], { separator: '|' });
    // @ts-expect-error: the address is required
    void formatAddress({ name: 'Ana' });
  });

  it('handles React and DOM paste events, and needs onAddresses', () => {
    expectTypeOf(pasteAddresses(reactPaste, { onAddresses: (list) => expectTypeOf(list).toEqualTypeOf<AddressList>() })).toEqualTypeOf<AddressPasteOutcome>();
    expectTypeOf(pasteAddresses(domPaste, { onAddresses: () => undefined, keepInvalid: false })).toEqualTypeOf<AddressPasteOutcome>();
    // @ts-expect-error: onAddresses is required
    void pasteAddresses(domPaste, {});
  });
});
