import { describe, expect, it } from 'vitest';
import { validatePayload } from '../../src/core/payload';
import { CLIP_HTML_ATTRIBUTE, clipPayload, defineClipFormat, type ClipFormat, type ClipFormatOptions } from '../../src/structured';
import { decodeBase64Url } from '../../src/structured/base64url';
import { INVOICES, Invoices, failureOf } from './fixtures';

/** A pass-through format; tests pick the value type explicitly. */
const define = <Value = unknown>(options: Partial<ClipFormatOptions<Value>> = {}): ClipFormat<Value> =>
  defineClipFormat({ id: 'acme.rows', schema: (data: unknown) => data, ...options } as ClipFormatOptions<unknown>) as ClipFormat<Value>;

const itemsOf = (payload: ReturnType<typeof clipPayload>) => Object.fromEntries(payload.items.map((item) => [item.mimeType, item]));

const envelopeOf = (id: string, version: number, data: unknown) => JSON.stringify({ rsc: 1, id, v: version, data });

describe('clipPayload', () => {
  it('writes the web format and custom type (optional), hidden HTML envelope and plain text', () => {
    const payload = clipPayload(Invoices, INVOICES);
    const envelope = envelopeOf('acme.invoices', 1, INVOICES);
    expect(payload.kind).toBe('multi');
    expect(payload.items).toEqual([
      { mimeType: 'web application/vnd.acme.invoices+json', data: envelope, optional: true },
      { mimeType: 'application/vnd.acme.invoices+json', data: envelope, optional: true },
      { mimeType: 'text/html', data: expect.stringMatching(/^<span data-rsc-clip="acme\.invoices;[A-Za-z0-9_-]+"><\/span>/) as unknown },
      { mimeType: 'text/plain', data: 'INV-1\t12400\nINV-2 <b>"&"</b>\t-50.5' },
    ]);
    expect(validatePayload(payload)).toBeNull();
  });

  it('embeds exactly the envelope, base64url-encoded (UTF-8 safe)', () => {
    const html = itemsOf(clipPayload(Invoices, INVOICES))['text/html']?.data ?? '';
    const token = /data-rsc-clip="acme\.invoices;([^"]+)"/.exec(html)?.[1] ?? '';
    expect(decodeBase64Url(token)).toBe(envelopeOf('acme.invoices', 1, INVOICES));
    expect(CLIP_HTML_ATTRIBUTE).toBe('data-rsc-clip');
  });

  it('escapes the default visible HTML and keeps line breaks', () => {
    const html = itemsOf(clipPayload(Invoices, INVOICES))['text/html']?.data ?? '';
    expect(html.slice(html.indexOf('</span>') + 7)).toBe("INV-1\t12400<br>INV-2 &lt;b&gt;&quot;&amp;&quot;&lt;/b&gt;\t-50.5");
    const crlf = define<string>({ text: () => "a\r\nb\rc\n'd'" });
    expect(itemsOf(clipPayload(crlf, 'x'))['text/html']?.data).toMatch(/<\/span>a<br>b<br>c<br>&#39;d&#39;$/);
  });

  it('uses custom html after the envelope', () => {
    const format = define<number>({ html: (value) => `<b>${String(value)}</b>` });
    expect(itemsOf(clipPayload(format, 7))['text/html']?.data).toMatch(/^<span [^>]+><\/span><b>7<\/b>$/);
  });

  it('defaults the plain text to the encoded data as indented JSON', () => {
    expect(itemsOf(clipPayload(define(), { a: [1] }))['text/plain']?.data).toBe('{\n  "a": [\n    1\n  ]\n}');
  });

  it('writes the encoded data and the version', () => {
    const format = define<Date>({ version: 3, encode: (date) => ({ at: date.toISOString() }) });
    const payload = clipPayload(format, new Date(Date.UTC(2026, 0, 2)));
    expect(itemsOf(payload)['application/vnd.acme.rows+json']?.data).toBe(envelopeOf('acme.rows', 3, { at: '2026-01-02T00:00:00.000Z' }));
  });

  it('serialises Dates (toJSON) and drops undefined properties, like JSON', () => {
    const payload = clipPayload(define(), { at: new Date(0), gone: undefined, list: [null] });
    expect(itemsOf(payload)['application/vnd.acme.rows+json']?.data).toBe(envelopeOf('acme.rows', 1, { at: '1970-01-01T00:00:00.000Z', list: [null] }));
  });

  it('can leave the data out of the HTML', () => {
    const plain = clipPayload(define({ embedInHtml: false }), 1);
    expect(plain.items.map((item) => item.mimeType)).toEqual([
      'web application/vnd.acme.rows+json',
      'application/vnd.acme.rows+json',
      'text/html',
      'text/plain',
    ]);
    expect(itemsOf(plain)['text/html']?.data).toBe('1');
    const noHtml = clipPayload(define({ embedInHtml: false, html: () => '' }), 1);
    expect(noHtml.items.map((item) => item.mimeType)).not.toContain('text/html');
  });

  describe('failures', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;

    it.each([
      ['NaN', { n: NaN }, '"n" is NaN'],
      ['Infinity at the top', -Infinity, 'The data is -Infinity'],
      ['a BigInt', { id: 1n }, '"id" is a BigInt'],
      ['a function', { fn: () => 1 }, '"fn" is a function'],
      ['a symbol', [Symbol('s')], '"0" is a symbol'],
      ['a Map', { m: new Map() }, '"m" is a Map'],
      ['a Set', new Set([1]), 'The data is a Set'],
      ['a WeakMap', { w: new WeakMap() }, '"w" is a WeakMap'],
      ['a WeakSet', { w: new WeakSet() }, '"w" is a WeakSet'],
      ['a cycle', cyclic, 'circular'],
    ])('rejects data with %s', (_label, data, message) => {
      const failure = failureOf(() => clipPayload(define(), data));
      expect(failure.type).toBe('invalid-payload');
      expect(failure.message).toContain(message);
    });

    it('rejects data that serialises to nothing', () => {
      expect(failureOf(() => clipPayload(define(), undefined)).message).toMatch(/serialised to nothing/);
      expect(failureOf(() => clipPayload(define({ encode: () => undefined }), 1)).message).toMatch(/serialised to nothing/);
    });

    it('rejects a non-cyclic error thrown while serialising with a generic reason', () => {
      const data = { toJSON: () => { throw new RangeError('boom'); } };
      expect(failureOf(() => clipPayload(define(), data)).message).toMatch(/circular reference\?/);
    });

    it('enforces maxBytes on the UTF-8 size of the envelope', () => {
      const envelopeBytes = new TextEncoder().encode(envelopeOf('acme.rows', 1, 'é')).length;
      expect(() => clipPayload(define({ maxBytes: envelopeBytes }), 'é')).not.toThrow();
      expect(failureOf(() => clipPayload(define({ maxBytes: envelopeBytes - 1 }), 'é'))).toMatchObject({ type: 'too-large' });
    });

    it('rejects empty or non-string text and non-string html', () => {
      expect(failureOf(() => clipPayload(define({ text: () => '' }), 1)).message).toMatch(/text/);
      expect(failureOf(() => clipPayload(define({ text: () => 1 as never }), 1)).message).toMatch(/text/);
      expect(failureOf(() => clipPayload(define({ html: () => null as never }), 1)).message).toMatch(/html/);
    });

    it('rejects a format not made by defineClipFormat', () => {
      expect(failureOf(() => clipPayload({ ...Invoices }, INVOICES)).message).toMatch(/defineClipFormat/);
      expect(failureOf(() => clipPayload(null as never, 1)).message).toMatch(/defineClipFormat/);
    });

    it('lets errors thrown by encode, text and html propagate', () => {
      const boom = new Error('boom');
      const thrower = () => {
        throw boom;
      };
      expect(() => clipPayload(define({ encode: thrower }), 1)).toThrow(boom);
      expect(() => clipPayload(define({ text: thrower }), 1)).toThrow(boom);
      expect(() => clipPayload(define({ html: thrower }), 1)).toThrow(boom);
    });
  });
});
