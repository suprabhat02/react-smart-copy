import { type } from 'arktype';
import * as v from 'valibot';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  clipAccept,
  clipPayload,
  defineClipFormat,
  readClip,
  readClipSync,
  type ClipFormat,
  type ClipFormatOptions,
  type ClipReadResult,
  type StandardSchemaV1,
} from '../../src/structured';
import { encodeBase64Url } from '../../src/structured/base64url';
import { INVOICES, Invoices, asPasteItems, failureOf } from './fixtures';

/** A pass-through format; tests pick the value type explicitly. */
const define = <Value = unknown>(options: Partial<ClipFormatOptions<Value>> = {}): ClipFormat<Value> =>
  defineClipFormat({ id: 'acme.rows', schema: (data: unknown) => data, ...options } as ClipFormatOptions<unknown>) as ClipFormat<Value>;

const WEB = 'web application/vnd.acme.rows+json';
const CUSTOM = 'application/vnd.acme.rows+json';

const envelope = (data: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({ rsc: 1, id: 'acme.rows', v: 1, data, ...extra });
const htmlWith = (json: string, id = 'acme.rows') => `<p>visible</p><span data-rsc-clip="${id};${encodeBase64Url(json)}"></span>`;

/** Reads with both entry points and checks they agree (the sync one has no Blobs or async schemas here). */
async function readBoth<Value>(source: Parameters<typeof readClip>[0], format: Parameters<typeof readClip<Value>>[1]): Promise<ClipReadResult<Value>> {
  const result = await readClip(source, format);
  expect(readClipSync(source, format)).toEqual(result);
  return result;
}

describe('readClip', () => {
  describe('round trips', () => {
    it('reads a clip payload back', async () => {
      expect(await readBoth(clipPayload(Invoices, INVOICES), Invoices)).toEqual({ status: 'ok', value: INVOICES, version: 1, carrier: 'web' });
    });

    it.each([
      ['web', [Invoices.webMimeType]],
      ['custom', [Invoices.mimeType]],
      ['html', ['text/html']],
    ] as const)('reads the %s carrier on its own (paste result items)', async (carrier, only) => {
      const items = asPasteItems(clipPayload(Invoices, INVOICES), only);
      expect(await readBoth({ items }, Invoices)).toEqual({ status: 'ok', value: INVOICES, version: 1, carrier });
    });

    it('prefers web, then custom, then html, whatever the entry order', async () => {
      const items = asPasteItems(clipPayload(Invoices, INVOICES)).reverse();
      expect((await readBoth({ items }, Invoices)).status === 'ok' && (await readClip({ items }, Invoices))).toMatchObject({ carrier: 'web' });
      expect(await readBoth({ items: items.filter((item) => item.type !== Invoices.webMimeType) }, Invoices)).toMatchObject({ carrier: 'custom' });
    });

    it('reads from a DataTransfer, touching only matching types', async () => {
      const data: Record<string, string> = { 'text/plain': 'rows', [CUSTOM]: envelope([1]), 'text/html': '<b>x</b>' };
      const getData = vi.fn((format: string) => data[format] ?? '');
      expect(await readBoth({ types: Object.keys(data), getData }, define())).toMatchObject({ status: 'ok', value: [1], carrier: 'custom' });
      expect(getData.mock.calls.map(([format]) => format)).not.toContain('text/plain');
    });

    it('matches carrier types case-insensitively and with parameters', async () => {
      const items = [{ type: 'Web Application/VND.acme.rows+json; charset=utf-8', data: envelope(1) }];
      expect(await readBoth({ items }, define())).toMatchObject({ status: 'ok', value: 1, carrier: 'web' });
    });

    it('reads the HTML carrier with single quotes, whitespace and other formats around it', async () => {
      const other = `<span data-rsc-clip="acme.other;${encodeBase64Url(envelope(0))}"></span>`;
      const html = `${other}<span data-rsc-clip = 'acme.rows;${encodeBase64Url(envelope(2))}'></span>`;
      expect(await readBoth({ items: [{ type: 'text/html', data: html }] }, define())).toMatchObject({ status: 'ok', value: 2 });
    });

    it('reads a Blob entry asynchronously and skips it synchronously', async () => {
      const items = [{ type: CUSTOM, data: new Blob([envelope('blob')]) }];
      expect(await readClip({ items }, define())).toMatchObject({ status: 'ok', value: 'blob' });
      expect(readClipSync({ items }, define())).toEqual({ status: 'absent' });
    });
  });

  describe('absent', () => {
    it.each([
      ['an empty source', []],
      ['unrelated entries', [{ type: 'text/plain', data: 'hello' }]],
      ['HTML without an envelope', [{ type: 'text/html', data: '<b>hi</b>' }]],
      ['an envelope for another format', [{ type: 'text/html', data: htmlWith(envelope(1), 'acme.other') }]],
      ['an unparsable type', [{ type: 'web nonsense', data: envelope(1) }]],
    ])('when the source holds %s', async (_label, items) => {
      expect(await readBoth({ items }, define())).toEqual({ status: 'absent' });
    });

    it('scans a bounded number of HTML envelopes', async () => {
      const decoy = `<span data-rsc-clip="acme.other;e30"></span>`.repeat(64);
      const html = decoy + htmlWith(envelope(1));
      expect(await readBoth({ items: [{ type: 'text/html', data: html }] }, define())).toEqual({ status: 'absent' });
      const fits = decoy.slice(decoy.length / 64) + htmlWith(envelope(1));
      expect(await readBoth({ items: [{ type: 'text/html', data: fits }] }, define())).toMatchObject({ status: 'ok' });
    });
  });

  describe('untrusted content', () => {
    const cases: readonly [string, string, string, RegExp][] = [
      ['not JSON', CUSTOM, '{"rsc":1,', /not valid JSON/],
      ['a JSON array', CUSTOM, '[1]', /not a clip envelope/],
      ['JSON null', CUSTOM, 'null', /not a clip envelope/],
      ['an unknown spec version', CUSTOM, envelope(1, { rsc: 2 }), /spec version/],
      ['no id', CUSTOM, envelope(1, { id: 7 }), /no format id/],
      ['a fractional version', CUSTOM, envelope(1, { v: 1.5 }), /invalid version/],
      ['a zero version', CUSTOM, envelope(1, { v: 0 }), /invalid version/],
      ['a string version', CUSTOM, envelope(1, { v: '1' }), /invalid version/],
      ['no data', CUSTOM, '{"rsc":1,"id":"acme.rows","v":1}', /no data/],
      ['another id under this type', WEB, envelope(1, { id: 'evil.rows' }), /"evil.rows" data under the "acme.rows" type/],
      ['a corrupted HTML token', 'text/html', '<span data-rsc-clip="acme.rows;A"></span>', /corrupted/],
      ['invalid UTF-8 in the HTML token', 'text/html', '<span data-rsc-clip="acme.rows;_w"></span>', /corrupted/],
    ];

    it.each(cases)('reports %s as invalid', async (_label, type, data, message) => {
      const result = await readBoth({ items: [{ type, data }] }, define());
      expect(result).toMatchObject({ status: 'invalid' });
      expect(result.status === 'invalid' && result.issues[0]?.message).toMatch(message);
    });

    it('falls back to the next carrier when one is unusable', async () => {
      const items = [
        { type: WEB, data: 'garbage' },
        { type: 'text/html', data: htmlWith(envelope('from html')) },
      ];
      expect(await readBoth({ items }, define())).toMatchObject({ status: 'ok', value: 'from html', carrier: 'html' });
    });

    it('reports the first problem when no carrier is usable', async () => {
      const items = [
        { type: 'text/html', data: '<span data-rsc-clip="acme.rows;A"></span>' },
        { type: WEB, data: 'garbage' },
      ];
      expect(await readBoth({ items }, define())).toMatchObject({ status: 'invalid', carrier: 'web' });
    });

    it('reports an unreadable Blob', async () => {
      const blob = new Blob(['x']);
      vi.spyOn(blob, 'text').mockRejectedValue(new Error('gone'));
      expect(await readClip({ items: [{ type: CUSTOM, data: blob }] }, define())).toMatchObject({
        status: 'invalid',
        carrier: 'custom',
        issues: [{ message: 'The clipboard entry could not be read.' }],
      });
    });

    it('drops __proto__ keys at every depth', async () => {
      const json = '{"rsc":1,"id":"acme.rows","v":1,"data":{"__proto__":{"polluted":true},"list":[{"__proto__":{"x":1},"ok":1}]}}';
      const result = await readBoth({ items: [{ type: CUSTOM, data: json }] }, define<Record<string, unknown>>());
      expect(result).toMatchObject({ status: 'ok', value: { list: [{ ok: 1 }] } });
      const value = result.status === 'ok' ? result.value : {};
      expect(Object.prototype.hasOwnProperty.call(value, '__proto__')).toBe(false);
      expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
      expect(Object.assign({}, value)).not.toHaveProperty('polluted');
    });

    it('ignores unknown envelope keys (forward compatibility)', async () => {
      expect(await readBoth({ items: [{ type: CUSTOM, data: envelope(1, { checksum: 'x' }) }] }, define())).toMatchObject({ status: 'ok', value: 1 });
    });

    describe('maxBytes', () => {
      const small = define({ maxBytes: 64 });
      const big = envelope('x'.repeat(100));

      it.each([WEB, CUSTOM])('limits the %s carrier before parsing', async (type) => {
        const parse = vi.spyOn(JSON, 'parse');
        expect(await readBoth({ items: [{ type, data: big }] }, small)).toMatchObject({ status: 'invalid', issues: [{ message: 'The clip exceeds the 64-byte limit.' }] });
        expect(parse).not.toHaveBeenCalled();
      });

      it('limits the HTML carrier before decoding', async () => {
        expect(await readBoth({ items: [{ type: 'text/html', data: htmlWith(big) }] }, small)).toMatchObject({ status: 'invalid', carrier: 'html' });
      });

      it('counts UTF-8 bytes, not characters', async () => {
        const json = envelope('é'.repeat(10));
        const bytes = new TextEncoder().encode(json).length;
        expect(await readBoth({ items: [{ type: CUSTOM, data: json }] }, define({ maxBytes: bytes }))).toMatchObject({ status: 'ok' });
        expect(await readBoth({ items: [{ type: CUSTOM, data: json }] }, define({ maxBytes: bytes - 1 }))).toMatchObject({ status: 'invalid' });
      });
    });
  });

  describe('versions and migrations', () => {
    const v3 = define<{ name: string; tags: string[] }>({
      version: 3,
      migrate: {
        1: (data) => ({ name: String(data) }),
        2: (data) => ({ ...(data as object), tags: [] }),
      },
    });
    const at = (version: number, data: unknown) => [{ type: CUSTOM, data: envelope(data, { v: version }) }];

    it('migrates through every step', async () => {
      expect(await readBoth({ items: at(1, 'Ada') }, v3)).toEqual({ status: 'ok', value: { name: 'Ada', tags: [] }, version: 1, carrier: 'custom' });
      expect(await readBoth({ items: at(2, { name: 'Ada' }) }, v3)).toMatchObject({ status: 'ok', value: { name: 'Ada', tags: [] }, version: 2 });
      expect(await readBoth({ items: at(3, { name: 'Ada', tags: ['x'] }) }, v3)).toMatchObject({ status: 'ok', version: 3 });
    });

    it('rejects data from a newer version', async () => {
      expect(await readBoth({ items: at(4, {}) }, v3)).toEqual({ status: 'unsupported-version', carrier: 'custom', version: 4 });
    });

    it('rejects data with no migration path', async () => {
      const gap = define({ version: 3, migrate: { 2: (data) => data } });
      expect(await readBoth({ items: at(1, {}) }, gap)).toEqual({ status: 'unsupported-version', carrier: 'custom', version: 1 });
    });

    it('reports a migration that throws', async () => {
      const boom = new Error('bad v1');
      const failing = define({ version: 2, migrate: { 1: () => { throw boom; } } });
      expect(await readBoth({ items: at(1, {}) }, failing)).toEqual({
        status: 'invalid',
        carrier: 'custom',
        issues: [{ message: 'Migrating from version 1 failed: bad v1', path: [] }],
        cause: boom,
      });
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- third-party code can throw anything
      const failingWithString = define({ version: 2, migrate: { 1: () => { throw 'nope'; } } });
      expect(await readBoth({ items: at(1, {}) }, failingWithString)).toMatchObject({ issues: [{ message: 'Migrating from version 1 failed: nope' }] });
    });

    it('validates after migrating', async () => {
      const strict = defineClipFormat({ id: 'acme.rows', version: 2, migrate: { 1: () => ({ wrong: true }) }, schema: z.object({ name: z.string() }) });
      expect(await readBoth({ items: at(1, 'Ada') }, strict)).toMatchObject({ status: 'invalid', issues: [{ path: ['name'] }] });
    });
  });

  describe('schemas', () => {
    const rows = (data: unknown) => [{ type: CUSTOM, data: envelope(data) }];

    it('validates with Zod, including transforms and coercion', async () => {
      const format = defineClipFormat({ id: 'acme.rows', schema: z.object({ at: z.coerce.date(), n: z.number().int() }) });
      expect(await readBoth({ items: rows({ at: '2026-01-02T00:00:00.000Z', n: 1 }) }, format)).toMatchObject({
        status: 'ok',
        value: { at: new Date('2026-01-02T00:00:00.000Z'), n: 1 },
      });
      const bad = await readBoth({ items: rows({ at: 'never', n: 1.5 }) }, format);
      expect(bad.status === 'invalid' && bad.issues.map((issue) => issue.path)).toEqual([['at'], ['n']]);
    });

    it('validates with Valibot', async () => {
      const format = defineClipFormat({ id: 'acme.rows', schema: v.array(v.object({ id: v.string() })) });
      expect(await readBoth({ items: rows([{ id: 'a' }]) }, format)).toMatchObject({ status: 'ok', value: [{ id: 'a' }] });
      const bad = await readBoth({ items: rows([{ id: 1 }]) }, format);
      expect(bad.status === 'invalid' && bad.issues[0]?.path).toEqual([0, 'id']);
    });

    it('validates with ArkType, whose schemas are callable but must be used through ~standard', async () => {
      const format = defineClipFormat({ id: 'acme.rows', schema: type({ id: 'string' }) });
      expect(await readBoth({ items: rows({ id: 'a' }) }, format)).toMatchObject({ status: 'ok', value: { id: 'a' } });
      expect(await readBoth({ items: rows({ id: 1 }) }, format)).toMatchObject({ status: 'invalid', issues: [{ path: ['id'] }] });
    });

    it('validates with a plain function', async () => {
      expect(await readBoth({ items: asPasteItems(clipPayload(Invoices, INVOICES), [Invoices.mimeType]) }, Invoices)).toMatchObject({ status: 'ok' });
      const garbage = [{ type: Invoices.mimeType, data: JSON.stringify({ rsc: 1, id: 'acme.invoices', v: 1, data: [{ id: 1 }] }) }];
      const result = await readBoth({ items: garbage }, Invoices);
      expect(result).toMatchObject({ status: 'invalid', issues: [{ message: 'Expected a list of invoices.', path: [] }] });
      expect(result.status === 'invalid' && result.cause).toBeInstanceOf(TypeError);
    });

    it('reports a validator that throws a non-Error', async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- third-party code can throw anything
      const format = define({ schema: () => { throw 'nope'; } });
      expect(await readBoth({ items: rows(1) }, format)).toMatchObject({ status: 'invalid', issues: [{ message: 'nope' }], cause: 'nope' });
    });

    const standard = (validate: StandardSchemaV1['~standard']['validate']): StandardSchemaV1 => ({ '~standard': { version: 1, vendor: 'test', validate } });

    it('supports asynchronous Standard Schemas in readClip, not in readClipSync', async () => {
      const format = defineClipFormat({ id: 'acme.rows', schema: standard((value) => Promise.resolve({ value })) });
      expect(await readClip({ items: rows(5) }, format)).toMatchObject({ status: 'ok', value: 5 });
      expect(readClipSync({ items: rows(5) }, format)).toEqual({
        status: 'invalid',
        carrier: 'custom',
        issues: [{ message: 'The schema validates asynchronously: use readClip().', path: [] }],
      });
    });

    it('does not leak an unhandled rejection from an async schema read synchronously', () => {
      const format = defineClipFormat({ id: 'acme.rows', schema: standard(() => Promise.reject(new Error('late'))) });
      expect(readClipSync({ items: rows(5) }, format)).toMatchObject({ status: 'invalid' });
    });

    it('reports async rejections and failures', async () => {
      const rejects = defineClipFormat({ id: 'acme.rows', schema: standard(() => Promise.reject(new Error('down'))) });
      expect(await readClip({ items: rows(1) }, rejects)).toMatchObject({ status: 'invalid', issues: [{ message: 'The schema threw: down' }] });
      const fails = defineClipFormat({ id: 'acme.rows', schema: standard(() => Promise.resolve({ issues: [{ message: 'no' }] })) });
      expect(await readClip({ items: rows(1) }, fails)).toMatchObject({ status: 'invalid', issues: [{ message: 'no', path: [] }] });
    });

    it('reports a schema that throws or returns a malformed result', async () => {
      const throws = defineClipFormat({ id: 'acme.rows', schema: standard(() => { throw new Error('crash'); }) });
      expect(await readBoth({ items: rows(1) }, throws)).toMatchObject({ status: 'invalid', issues: [{ message: 'The schema threw: crash' }] });
      const malformed = defineClipFormat({ id: 'acme.rows', schema: standard(() => null as never) });
      expect(await readBoth({ items: rows(1) }, malformed)).toMatchObject({ issues: [{ message: 'The schema returned a malformed result.' }] });
    });

    it('normalises issues: object path segments, missing paths, empty lists and odd messages', async () => {
      const format = defineClipFormat({
        id: 'acme.rows',
        schema: standard(() => ({ issues: [{ message: 'a', path: [{ key: 'rows' }, 0] }, { message: 42 as never }] })),
      });
      expect(await readBoth({ items: rows(1) }, format)).toMatchObject({
        issues: [
          { message: 'a', path: ['rows', 0] },
          { message: 'Invalid value.', path: [] },
        ],
      });
      const odd = defineClipFormat({ id: 'acme.rows', schema: standard(() => ({ issues: [null, { message: 'b', path: 'x' }] as never })) });
      expect(await readBoth({ items: rows(1) }, odd)).toMatchObject({
        issues: [
          { message: 'Invalid value.', path: [] },
          { message: 'b', path: [] },
        ],
      });
      const notAList = defineClipFormat({ id: 'acme.rows', schema: standard(() => ({ issues: null as never })) });
      expect(await readBoth({ items: rows(1) }, notAList)).toMatchObject({ issues: [{ message: 'The schema rejected the data.' }] });
      const empty = defineClipFormat({ id: 'acme.rows', schema: standard(() => ({ issues: [] })) });
      expect(await readBoth({ items: rows(1) }, empty)).toMatchObject({ issues: [{ message: 'The schema rejected the data.' }] });
    });
  });

  it('rejects a format not made by defineClipFormat', async () => {
    await expect(readClip({ items: [] }, { ...Invoices })).rejects.toMatchObject({ copyError: { type: 'invalid-payload' } });
    expect(failureOf(() => readClipSync({ items: [] }, { ...Invoices })).type).toBe('invalid-payload');
  });
});

describe('clipAccept', () => {
  it('lists each format’s web and custom types, then html', () => {
    const other = defineClipFormat({ id: 'acme.other', schema: (data: unknown) => data });
    expect(clipAccept(Invoices, other)).toEqual([
      'web application/vnd.acme.invoices+json',
      'application/vnd.acme.invoices+json',
      'web application/vnd.acme.other+json',
      'application/vnd.acme.other+json',
      'html',
    ]);
    expect(clipAccept()).toEqual(['html']);
  });

  it('rejects a format not made by defineClipFormat', () => {
    expect(failureOf(() => clipAccept({ ...Invoices })).type).toBe('invalid-payload');
  });
});
