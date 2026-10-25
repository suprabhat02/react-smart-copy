// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ADDRESS_LIST_MAX_LENGTH, parseAddress, parseAddresses, type ParseAddressesOptions } from '../../src/email';

/** The addresses read, as `name <address>` (or the address), and the invalid entries as `reason: text`. */
function read(text: string, options?: ParseAddressesOptions) {
  const list = parseAddresses(text, options);
  return {
    ok: list.addresses.map((one) => (one.name === null ? one.address : `${one.name} <${one.address}>`)),
    bad: list.invalid.map((one) => `${one.reason}: ${one.text}`),
  };
}

describe('parseAddresses: lists as mail programs copy them', () => {
  it('reads bare addresses, separated by commas, semicolons, line breaks and tabs', () => {
    expect(read('ana@example.com, bo@example.org; cy@example.net\ndee@example.io\teve@example.dev').ok).toEqual([
      'ana@example.com',
      'bo@example.org',
      'cy@example.net',
      'dee@example.io',
      'eve@example.dev',
    ]);
    expect(read('ana@example.com,,; ,\n\n bo@example.org ;').ok).toEqual(['ana@example.com', 'bo@example.org']);
    expect(read('ana@example.com\r\nbo@example.org\rcy@example.net').ok).toEqual(['ana@example.com', 'bo@example.org', 'cy@example.net']);
  });

  it('reads Gmail and Apple Mail: names before angle brackets', () => {
    expect(read('Ana Lima <ana@example.com>, "Bo Diaz" <bo@example.org>, <cy@example.net>').ok).toEqual([
      'Ana Lima <ana@example.com>',
      'Bo Diaz <bo@example.org>',
      'cy@example.net',
    ]);
  });

  it('reads Outlook: commas inside quoted and unquoted names, semicolons between', () => {
    expect(read('"Lima, Ana" <ana@example.com>; Diaz, Bo <bo@example.org>; Ng, Cy, Jr. <cy@example.net>').ok).toEqual([
      'Lima, Ana <ana@example.com>',
      'Diaz, Bo <bo@example.org>',
      'Ng, Cy, Jr. <cy@example.net>',
    ]);
    // A name before a bare address is not joined to it: it is an entry of its own.
    expect(read('Sales, ana@example.com')).toEqual({ ok: ['ana@example.com'], bad: ['syntax: Sales'] });
    // Names separated by semicolons belong to different entries.
    expect(read('Sales; Ana <ana@example.com>')).toEqual({ ok: ['Ana <ana@example.com>'], bad: ['syntax: Sales'] });
    expect(read('Team; Lima, Ana <ana@example.com>')).toEqual({ ok: ['Lima, Ana <ana@example.com>'], bad: ['syntax: Team'] });
  });

  it('reads quoted names with escapes, and separators inside brackets', () => {
    expect(read('"Ana \\"AL\\" Lima; CEO" <ana@example.com>').ok).toEqual(['Ana "AL" Lima; CEO <ana@example.com>']);
    expect(read("'Ana Lima' <ana@example.com>").ok).toEqual(['Ana Lima <ana@example.com>']);
    expect(read('ana@example.com (Lima, Ana)').ok).toEqual(['Lima, Ana <ana@example.com>']);
    expect(read('"unclosed, quote <ana@example.com>').bad).toEqual(['syntax: "unclosed, quote <ana@example.com>']);
  });

  it('reads mailto: links, with or without a query', () => {
    expect(read('mailto:ana@example.com?subject=Hi, MAILTO:bo@example.org').ok).toEqual(['ana@example.com', 'bo@example.org']);
    expect(read('Ana <mailto:ana@example.com>').ok).toEqual(['Ana <ana@example.com>']);
  });

  it('reads spreadsheet rows: a name in the cells before or after the address', () => {
    const sheet = 'Name\tEmail\nAna Lima\tana@example.com\nBo\tDiaz\tbo@example.org\ncy@example.net\tCy Ng\ndee@example.io\n\teve@example.dev';
    expect(read(sheet)).toEqual({
      ok: ['Ana Lima <ana@example.com>', 'Bo Diaz <bo@example.org>', 'Cy Ng <cy@example.net>', 'dee@example.io', 'eve@example.dev'],
      bad: ['syntax: Name', 'syntax: Email'],
    });
  });

  it('reads contact cards: a name and an address separated by spaces', () => {
    expect(read('Ana Lima ana@example.com').ok).toEqual(['Ana Lima <ana@example.com>']);
    expect(read('ana@example.com Ana Lima').ok).toEqual(['Ana Lima <ana@example.com>']);
    // The words before the address are its name, whatever they are.
    expect(read('ana lima@example.com').ok).toEqual(['ana <lima@example.com>']);
    // An address in the middle of words, or two addresses, is not one entry.
    expect(read('write to ana@example.com today').bad).toEqual(['syntax: write to ana@example.com today']);
    expect(read('ana@example.com bo@example.org').bad).toEqual(['syntax: ana@example.com bo@example.org']);
  });

  it('cleans names: whitespace, control characters, and names that repeat the address', () => {
    expect(parseAddresses('"  Ana \u0007 Lima\u200B " <ana@example.com>').addresses[0]?.name).toBe('Ana Lima');
    expect(parseAddresses('"ANA@example.com" <ana@example.com>').addresses[0]?.name).toBeNull();
    expect(parseAddresses('"" <ana@example.com>').addresses[0]?.name).toBeNull();
    expect(parseAddresses(`"${'n'.repeat(400)}" <ana@example.com>`).addresses[0]?.name).toHaveLength(256);
  });
});

describe('parseAddresses: checking each address', () => {
  it('turns away what is not shaped like an address', () => {
    for (const text of ['ana', 'ana@', '@example.com', 'ana@@example.com', 'a@b@example.com', 'ana..lima@example.com', '.ana@example.com', 'ana.@example.com', '"ana lima"@example.com', 'ana<x>@example.com', 'Ana <ana@example.com> extra', 'Ana <ana@example.com', '<a@example.com> <b@example.com>', 'a@example.com (Ana) (Lima)', 'ana (a@example.com)', 'Ana <ana> a@example.com', 'a b@example.com (Ana)']) {
      expect(parseAddresses(text).invalid.map((one) => one.reason), text).toEqual(['syntax']);
    }
  });

  it('turns away domains no address can be at', () => {
    for (const text of ['ana@localhost', 'ana@example', 'ana@example.c', 'ana@example.123', 'ana@192.0.2.1', 'ana@[192.0.2.1]', 'ana@-example.com', 'ana@example-.com', 'ana@exa_mple.com', 'ana@example..com', 'ana@.example.com', 'ana@example.com.', 'ana@ex%41mple.com', 'ana@example.com/path', 'ana@ex ample.com', `ana@${'a'.repeat(64)}.com`, `ana@${'abc.'.repeat(63)}com`, 'ana@xn--.com']) {
      expect(parseAddresses(text).invalid.map((one) => one.reason), text).toEqual(['domain']);
    }
  });

  it('turns away addresses longer than mail allows', () => {
    expect(parseAddresses(`${'a'.repeat(65)}@example.com`).invalid[0]?.reason).toBe('too-long');
    expect(parseAddresses(`${'a'.repeat(64)}@example.com`).addresses).toHaveLength(1);
    const domain = `${'a'.repeat(60)}.${'b'.repeat(60)}.${'c'.repeat(60)}.${'d'.repeat(5)}.com`;
    expect(parseAddresses(`${'x'.repeat(64)}@${domain}`).invalid[0]?.reason).toBe('too-long');
  });

  it('turns away invisible and direction-changing characters', () => {
    for (const hidden of ['\u200B', '\u200D', '\u202E', '\u2066', '\u00AD', '\uFE0F', '\u034F', '\u17B4']) {
      expect(parseAddresses(`an${hidden}a@example.com`).invalid[0]?.reason, hidden.codePointAt(0)?.toString(16)).toBe('invisible');
    }
    // A byte order mark at the very start is how some programs copy text: it is dropped.
    expect(parseAddresses('\uFEFFana@example.com').addresses).toHaveLength(1);
  });

  it('reads international addresses, full-width text and case', () => {
    const [one] = parseAddresses('Ana <Ana.Lima@B\u00DCCHER.de>').addresses;
    expect(one).toEqual({ address: 'Ana.Lima@xn--bcher-kva.de', display: 'Ana.Lima@b\u00FCcher.de', name: 'Ana', lookalike: false });
    expect(parseAddresses('\u7528\u6237@\u4F8B\u3048\u3002\u30C6\u30B9\u30C8').addresses[0]).toMatchObject({ address: '\u7528\u6237@xn--r8jz45g.xn--zckzah', display: '\u7528\u6237@\u4F8B\u3048.\u30C6\u30B9\u30C8' });
    expect(parseAddresses('\uFF41\uFF4E\uFF41\uFF20\uFF45\uFF58\uFF41\uFF4D\uFF50\uFF4C\uFF45.com').addresses[0]?.address).toBe('ana@example.com');
    expect(parseAddresses("o'brien+tag@example.co.uk").addresses[0]?.address).toBe("o'brien+tag@example.co.uk");
  });

  it('flags lookalike domains that mix scripts', () => {
    expect(parseAddresses('ana@ex\u0430mple.com').addresses[0]).toMatchObject({ address: 'ana@xn--exmple-4nf.com', lookalike: true });
    expect(parseAddresses('ana@g\u03BFogle.com').addresses[0]?.lookalike).toBe(true);
    // A whole label in one script is not mixed.
    expect(parseAddresses('ana@\u043F\u0440\u0438\u043C\u0435\u0440.\u0440\u0444').addresses[0]?.lookalike).toBe(false);
    expect(parseAddresses('ana@example.com').addresses[0]?.lookalike).toBe(false);
  });
});

describe('parseAddresses: options and limits', () => {
  it('leaves out duplicates without case, keeping the first, and a name given later', () => {
    const list = parseAddresses('ana@example.com, ANA@EXAMPLE.COM, Ana Lima <Ana@Example.com>, Other <ana@example.com>, bo@example.org');
    expect(list.addresses.map((one) => `${String(one.name)} ${one.address}`)).toEqual(['Ana Lima ana@example.com', 'null bo@example.org']);
    expect(list.duplicates).toBe(3);
    expect(parseAddresses('ana@example.com, ana@example.com', { dedupe: false }).addresses).toHaveLength(2);
  });

  it('accepts only the domains asked for, and their subdomains', () => {
    const list = read('ana@example.com, bo@mail.EXAMPLE.com, cy@example.org, dee@notexample.com, eve@b\u00FCcher.de', { domains: ['Example.com', 'b\u00FCcher.de'] });
    expect(list).toEqual({
      ok: ['ana@example.com', 'bo@mail.example.com', 'eve@xn--bcher-kva.de'],
      bad: ['not-allowed: cy@example.org', 'not-allowed: dee@notexample.com'],
    });
    for (const domains of [['localhost'], ['example.com', 'not a domain']]) {
      expect(() => parseAddresses('a@example.com', { domains })).toThrow(expect.objectContaining({ copyError: expect.objectContaining({ type: 'invalid-payload' }) }));
    }
  });

  it('reads at most maxAddresses entries, and says it stopped', () => {
    const many = Array.from({ length: 5 }, (_, index) => `user${String(index)}@example.com`).join(', ');
    expect(parseAddresses(many, { maxAddresses: 3 })).toMatchObject({ truncated: true, addresses: [{}, {}, {}] });
    expect(parseAddresses(many, { maxAddresses: 5 }).truncated).toBe(false);
    for (const maxAddresses of [0, -1, 1.5, Number.NaN, Infinity]) {
      expect(() => parseAddresses('a@example.com', { maxAddresses })).toThrow(expect.objectContaining({ copyError: expect.objectContaining({ type: 'invalid-payload' }) }));
    }
  });

  it('reads at most ADDRESS_LIST_MAX_LENGTH characters, quickly', () => {
    const long = `ana@example.com,${' '.repeat(ADDRESS_LIST_MAX_LENGTH)}bo@example.org`;
    expect(parseAddresses(long)).toMatchObject({ truncated: true, addresses: [{ address: 'ana@example.com' }] });
    const hostile = ['"'.repeat(ADDRESS_LIST_MAX_LENGTH), '<'.repeat(ADDRESS_LIST_MAX_LENGTH), '('.repeat(ADDRESS_LIST_MAX_LENGTH), '@'.repeat(ADDRESS_LIST_MAX_LENGTH), 'a@b.co,'.repeat(ADDRESS_LIST_MAX_LENGTH / 7), '\\"'.repeat(ADDRESS_LIST_MAX_LENGTH / 2), 'a '.repeat(ADDRESS_LIST_MAX_LENGTH / 2) + '@'];
    for (const text of hostile) {
      const started = performance.now();
      parseAddresses(text);
      expect(performance.now() - started, text.slice(0, 8)).toBeLessThan(2000);
    }
  });

  it('keeps long invalid entries short, and reads no entry longer than an address could be', () => {
    expect(parseAddresses('x'.repeat(1000)).invalid[0]).toEqual({ text: 'x'.repeat(256), reason: 'syntax' });
    expect(parseAddresses(`"${'n'.repeat(1100)}" <ana@example.com>`).invalid[0]?.reason).toBe('too-long');
  });
});

describe('parseAddress', () => {
  it('reads exactly one address', () => {
    expect(parseAddress('Ana Lima <ana@example.com>')).toMatchObject({ address: 'ana@example.com', name: 'Ana Lima' });
    expect(parseAddress(' ana@example.com ')?.address).toBe('ana@example.com');
    for (const text of ['', 'ana', 'ana@example.com, bo@example.org', 'ana@example.com, ana@example.com', 'ana@example.com, oops', 'a@example.com,b@example.com,c@example.com']) {
      expect(parseAddress(text), text).toBeNull();
    }
  });
});
