// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { addressesPayload, formatAddress, parseAddresses } from '../../src/email';

const invalid = expect.objectContaining({ copyError: expect.objectContaining({ type: 'invalid-payload' }) });

describe('formatAddress', () => {
  it('writes names as mail programs do, quoting them when they need it', () => {
    expect(formatAddress({ address: 'ana@example.com' })).toBe('ana@example.com');
    expect(formatAddress({ address: 'ana@example.com', name: null })).toBe('ana@example.com');
    expect(formatAddress({ address: 'ana@example.com', name: '  ' })).toBe('ana@example.com');
    expect(formatAddress({ address: 'ana@example.com', name: 'Ana Lima' })).toBe('Ana Lima <ana@example.com>');
    expect(formatAddress({ address: 'ana@example.com', name: 'Lima, Ana' })).toBe('"Lima, Ana" <ana@example.com>');
    expect(formatAddress({ address: 'ana@example.com', name: 'Ana "AL" Lima \\ CEO' })).toBe('"Ana \\"AL\\" Lima \\\\ CEO" <ana@example.com>');
    expect(formatAddress({ address: 'ana@b\u00FCcher.de', name: 'Ana' })).toBe('Ana <ana@b\u00FCcher.de>');
  });

  it('never lets a name end a mail header', () => {
    expect(formatAddress({ address: 'ana@example.com', name: 'Ana\r\nBcc: everyone@example.com' })).toBe('"Ana Bcc: everyone@example.com" <ana@example.com>');
    expect(formatAddress({ address: 'ana@example.com', name: 'Ana\u2028Lima\u202E' })).toBe('Ana Lima <ana@example.com>');
  });

  it('throws for an address that is not one', () => {
    for (const address of ['', 'ana', 'ana@localhost', 'ana@example.com\r\nBcc: x@example.com', 'ana@exa\u200Bmple.com']) {
      expect(() => formatAddress({ address }), address).toThrow(invalid);
    }
  });

  it('writes what parseAddresses read so it reads back the same', () => {
    const text = '"Lima, Ana" <ana@example.com>; Bo <bo@example.org>, cy@example.net';
    const { addresses } = parseAddresses(text);
    const again = parseAddresses(addresses.map(formatAddress).join(', ')).addresses;
    expect(again).toEqual(addresses);
  });
});

describe('addressesPayload', () => {
  it('is a text payload of the addresses, separated as asked', () => {
    const list = [{ address: 'ana@example.com', name: 'Lima, Ana' }, { address: 'bo@example.org' }];
    expect(addressesPayload(list)).toEqual({ kind: 'text', value: '"Lima, Ana" <ana@example.com>, bo@example.org' });
    expect(addressesPayload(list, { separator: '; ' }).value).toBe('"Lima, Ana" <ana@example.com>; bo@example.org');
    expect(addressesPayload(list, { separator: '\n' }).value).toBe('"Lima, Ana" <ana@example.com>\nbo@example.org');
    expect(addressesPayload([])).toEqual({ kind: 'text', value: '' });
    expect(() => addressesPayload([{ address: 'nope' }])).toThrow(invalid);
  });
});
