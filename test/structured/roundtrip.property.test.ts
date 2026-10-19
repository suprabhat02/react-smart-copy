import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { clipPayload, defineClipFormat, readClipSync } from '../../src/structured';
import { decodeBase64Url, encodeBase64Url } from '../../src/structured/base64url';

// Property tests run hundreds of cases, often next to other suites on shared CI runners.
vi.setConfig({ testTimeout: 60_000 });

const RUNS = { numRuns: 300 };

/** Any JSON value JSON.stringify keeps unchanged: no -0 (it becomes 0), no undefined. */
const jsonValue = fc.jsonValue().filter((value) => !Object.is(value, -0) && JSON.stringify(value) === JSON.stringify(JSON.parse(JSON.stringify(value))));

/** What a clip delivers: JSON semantics, minus own `__proto__` keys (dropped by design). */
const delivered = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value), (key, inner: unknown) => (key === '__proto__' ? undefined : inner));

const Any = defineClipFormat({ id: 'test.any', schema: (data: unknown) => data });

const only = (payload: ReturnType<typeof clipPayload>, type: string) =>
  payload.items.filter((item) => item.mimeType === type).map((item) => ({ type: item.mimeType, data: item.data }));

describe('structured round trips (property-based)', () => {
  it('base64url: every string survives encode → decode, and tokens use the URL-safe alphabet', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme' }), (text) => {
        const token = encodeBase64Url(text);
        expect(token).toMatch(/^[A-Za-z0-9_-]*$/);
        expect(decodeBase64Url(token)).toBe(text);
      }),
      RUNS,
    );
  });

  it.each([Any.webMimeType, Any.mimeType, 'text/html'])('every JSON value survives the %s carrier', (type) => {
    fc.assert(
      fc.property(jsonValue, (value) => {
        const result = readClipSync({ items: only(clipPayload(Any, value), type) }, Any);
        expect(result).toEqual({ status: 'ok', value: delivered(value), version: 1, carrier: expect.any(String) as unknown });
      }),
      RUNS,
    );
  });

  it('arbitrary HTML around the envelope never breaks or fools the HTML carrier', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), jsonValue, (before, after, value) => {
        const html = only(clipPayload(Any, value), 'text/html')[0]?.data ?? '';
        const result = readClipSync({ items: [{ type: 'text/html', data: before + html + after }] }, Any);
        // A prefix may itself contain a (bogus) token; the read must still never throw.
        expect(['ok', 'invalid']).toContain(result.status);
        if (!before.includes('data-rsc-clip')) expect(result).toMatchObject({ status: 'ok' });
      }),
      RUNS,
    );
  });

  it('garbage in any carrier yields a result, never an exception', () => {
    fc.assert(
      fc.property(fc.constantFrom(Any.webMimeType, Any.mimeType, 'text/html'), fc.string({ unit: 'binary' }), (type, data) => {
        const result = readClipSync({ items: [{ type, data: type === 'text/html' ? `<span data-rsc-clip="test.any;${data}"></span>` : data }] }, Any);
        expect(['absent', 'invalid', 'ok']).toContain(result.status);
      }),
      RUNS,
    );
  });
});
