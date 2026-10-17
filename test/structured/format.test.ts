import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DEFAULT_CLIP_MAX_BYTES, defineClipFormat, type ClipFormatOptions } from '../../src/structured';
import { failureOf, invoiceList } from './fixtures';

const define = (options: Partial<ClipFormatOptions<unknown>>) =>
  defineClipFormat({ id: 'acme.rows', schema: (data: unknown) => data, ...options });

describe('defineClipFormat', () => {
  it('derives clipboard types and defaults', () => {
    const format = defineClipFormat({ id: 'acme.invoice-rows', schema: invoiceList });
    expect(format).toMatchObject({
      id: 'acme.invoice-rows',
      version: 1,
      mimeType: 'application/vnd.acme.invoice-rows+json',
      webMimeType: 'web application/vnd.acme.invoice-rows+json',
      maxBytes: DEFAULT_CLIP_MAX_BYTES,
      embedInHtml: true,
      encode: undefined,
      text: undefined,
      html: undefined,
    });
    expect(Object.keys(format.migrate)).toEqual([]);
  });

  it('returns a frozen format with frozen migrations', () => {
    const format = define({ version: 2, migrate: { 1: (data) => data } });
    expect(Object.isFrozen(format)).toBe(true);
    expect(Object.isFrozen(format.migrate)).toBe(true);
    expect(Object.getPrototypeOf(format.migrate)).toBeNull();
  });

  it('accepts Standard Schemas from Zod and Valibot, and plain validators', () => {
    expect(() => defineClipFormat({ id: 'acme.zod', schema: z.array(z.string()) })).not.toThrow();
    expect(() => defineClipFormat({ id: 'acme.valibot', schema: v.array(v.string()) })).not.toThrow();
    expect(() => defineClipFormat({ id: 'acme.fn', schema: invoiceList })).not.toThrow();
  });

  it.each(['acme.rows', 'acme.invoice-rows', 'com.acme.v2.rows', 'a1.b2'])('accepts the id %j', (id) => {
    expect(define({ id }).id).toBe(id);
  });

  it.each([
    'rows', // not namespaced
    'Acme.Rows',
    'acme..rows',
    'acme.rows.',
    '.acme.rows',
    'acme.-rows',
    'acme.rows-',
    'acme rows',
    'acme.ro"ws',
    'acme_rows.x',
    '',
    `acme.${'x'.repeat(92)}`,
    42,
  ])('rejects the id %j', (id) => {
    expect(failureOf(() => define({ id: id as string }))).toMatchObject({ type: 'invalid-payload' });
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '2'])('rejects version %j', (version) => {
    expect(failureOf(() => define({ version: version as number })).message).toMatch(/version/);
  });

  it.each([undefined, null, 42, 'schema', {}, { '~standard': { version: 2, validate: () => ({ value: 1 }) } }, { '~standard': { version: 1 } }])(
    'rejects schema %j',
    (schema) => {
      expect(failureOf(() => define({ schema: schema as never })).message).toMatch(/schema/);
    },
  );

  it.each([0, -1, 1.5, NaN, '1'])('rejects maxBytes %j', (maxBytes) => {
    expect(failureOf(() => define({ maxBytes: maxBytes as number })).message).toMatch(/maxBytes/);
  });

  it('accepts Infinity and positive integers as maxBytes', () => {
    expect(define({ maxBytes: Infinity }).maxBytes).toBe(Infinity);
    expect(define({ maxBytes: 10 }).maxBytes).toBe(10);
  });

  it.each(['encode', 'text', 'html'] as const)('rejects a non-function %s', (name) => {
    expect(failureOf(() => define({ [name]: 'nope' })).message).toContain(name);
  });

  describe('migrate', () => {
    it('keys migrations by the version they upgrade from', () => {
      const step = (data: unknown) => data;
      const format = define({ version: 3, migrate: { 1: step, 2: step } });
      expect(format.migrate[1]).toBe(step);
      expect(format.migrate[2]).toBe(step);
    });

    it.each([
      ['a non-object', 42],
      ['null', null],
    ])('rejects %s', (_label, migrate) => {
      expect(failureOf(() => define({ version: 2, migrate: migrate as never })).message).toMatch(/migrate/);
    });

    it.each(['0', '2', '3', '1.5', '01', 'x'])('rejects the key %j for version 2', (key) => {
      expect(failureOf(() => define({ version: 2, migrate: { [key]: (data: unknown) => data } })).message).toMatch(/migrate/);
    });

    it('rejects a step that is not a function', () => {
      expect(failureOf(() => define({ version: 2, migrate: { 1: 'up' as never } })).message).toContain('migrate[1]');
    });
  });
});
