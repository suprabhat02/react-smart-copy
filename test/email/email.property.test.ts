import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatAddress, parseAddresses } from '../../src/email';
import { runs } from '../property';

const localPart = fc.stringMatching(/^[a-z0-9!#$%&'*+/=?^_`{|}~-]{1,20}(?:\.[a-z0-9_+-]{1,10}){0,2}$/);
const domain = fc
  .tuple(fc.array(fc.stringMatching(/^[a-z0-9](?:[a-z0-9-]{0,10}[a-z0-9])?$/).filter((label) => !label.startsWith('xn--')), { minLength: 1, maxLength: 3 }), fc.constantFrom('com', 'org', 'io', 'co', 'de', 'xn--p1ai'))
  .map(([labels, tld]) => [...labels, tld].join('.'));
const address = fc.tuple(localPart, domain).map(([local, host]) => `${local}@${host}`);
// `xn--` labels must be valid Punycode: none are generated here.
/** Names people have: letters of several scripts, spaces, and the characters that need quotes. */
const name = fc
  .array(fc.constantFrom('Ana', 'Lima', 'Jos\u00E9', '\u674E', '\u0418\u0432\u0430\u043D', 'O\'Neil', ',', ';', '"', '\\', '<', '>', '(', ')', '@', '.', ':', '[', ']', ' ', '-', 'Jr.'), { minLength: 1, maxLength: 8 })
  .map((parts) => parts.join(''));
const clean = (text: string): string | null => {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed === '' ? null : collapsed;
};

describe('parseAddresses, for any text', () => {
  it('never throws, and every address it gives is valid and in ASCII form', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 300 }), (text) => {
        const list = parseAddresses(text);
        for (const one of list.addresses) {
          expect(one.address).toMatch(/^[^\s@]+@[a-z0-9.-]+$/);
          expect(one.address.length).toBeLessThanOrEqual(254);
          expect(one.name ?? '').not.toMatch(/[\r\n\p{Cc}\p{Cf}]/u);
        }
        expect(new Set(list.addresses.map((one) => one.address.toLowerCase())).size).toBe(list.addresses.length);
      }),
      runs(1000),
    );
  });

  it('never throws on text made of address characters', () => {
    const chars = fc.constantFrom('a', 'b', '1', '@', '.', ',', ';', '\n', '\t', ' ', '"', '\\', '<', '>', '(', ')', '-', '_', 'mailto:', '?', '\uFF20', '\u200B', '\u0430');
    fc.assert(
      fc.property(fc.array(chars, { maxLength: 60 }), (parts) => {
        const list = parseAddresses(parts.join(''));
        expect(list.addresses.length + list.invalid.length + list.duplicates).toBeLessThanOrEqual(1000);
      }),
      runs(2000),
    );
  });
});

describe('formatAddress and parseAddresses together', () => {
  it('read back any address and name exactly as written', () => {
    fc.assert(
      fc.property(address, fc.option(name, { nil: null }), (written, writtenName) => {
        const [read] = parseAddresses(formatAddress({ address: written, name: writtenName })).addresses;
        expect(read?.address).toBe(written);
        const expected = writtenName === null ? null : clean(writtenName);
        expect(read?.name).toBe(expected !== null && expected.toLowerCase() === written.toLowerCase() ? null : expected);
      }),
      runs(1000),
    );
  });

  it('read back a whole list, whatever separates its entries', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.tuple(address, fc.option(name, { nil: null })), { selector: ([one]) => one.toLowerCase(), minLength: 1, maxLength: 12 }), fc.constantFrom(', ', '; ', '\n', ',', ';'), (people, separator) => {
        const text = people.map(([one, who]) => formatAddress({ address: one, name: who })).join(separator);
        expect(parseAddresses(text).addresses.map((one) => one.address)).toEqual(people.map(([one]) => one));
      }),
      runs(500),
    );
  });
});
