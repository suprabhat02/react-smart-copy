import { type } from 'arktype';
import * as v from 'valibot';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { SyncCopyPayload } from '../../src/core/copy-interceptor';
import type { DragCopyPayload } from '../../src/core/drag-copy';
import type { CopyPayload } from '../../src/core/payload';
import type { PasteAccept, PasteResult } from '../../src/core/paste-reader';
import {
  clipAccept,
  clipPayload,
  defineClipFormat,
  readClip,
  readClipSync,
  type ClipFormat,
  type ClipReadResult,
  type ClipValue,
  type InferSchemaOutput,
} from '../../src/structured';

interface Invoice {
  id: string;
  amount: number;
}

describe('structured types', () => {
  it('infers the value from a Zod schema, including transforms', () => {
    const Rows = defineClipFormat({ id: 'acme.rows', schema: z.array(z.object({ id: z.string(), at: z.coerce.date() })) });
    expectTypeOf(Rows).toEqualTypeOf<ClipFormat<{ id: string; at: Date }[]>>();
    expectTypeOf<ClipValue<typeof Rows>>().toEqualTypeOf<{ id: string; at: Date }[]>();
  });

  it('infers the value from Valibot and ArkType schemas', () => {
    const V = defineClipFormat({ id: 'acme.v', schema: v.object({ id: v.string(), n: v.number() }) });
    expectTypeOf<ClipValue<typeof V>>().toEqualTypeOf<{ id: string; n: number }>();
    const A = defineClipFormat({ id: 'acme.a', schema: type({ id: 'string' }) });
    expectTypeOf<ClipValue<typeof A>>().toEqualTypeOf<{ id: string }>();
  });

  it('InferSchemaOutput reads the output type of any Standard Schema', () => {
    const schema = z.string().transform((text) => text.length);
    expectTypeOf<InferSchemaOutput<typeof schema>>().toEqualTypeOf<number>();
  });

  it('infers the value from a validator function', () => {
    const Invoices = defineClipFormat({ id: 'acme.invoices', schema: (data: unknown): Invoice[] => data as Invoice[] });
    expectTypeOf<ClipValue<typeof Invoices>>().toEqualTypeOf<Invoice[]>();
  });

  it('types the callbacks from the schema', () => {
    defineClipFormat({
      id: 'acme.rows',
      schema: z.array(z.object({ id: z.string() })),
      text: (rows) => {
        expectTypeOf(rows).toEqualTypeOf<{ id: string }[]>();
        return rows.map((row) => row.id).join('\n');
      },
      html: (rows) => `<b>${String(rows.length)}</b>`,
      encode: (rows) => rows.map((row) => row.id),
      migrate: { 1: (data) => data },
    });
  });

  it('checks the copied value against the format', () => {
    const Rows = defineClipFormat({ id: 'acme.rows', schema: z.array(z.object({ id: z.string() })) });
    clipPayload(Rows, [{ id: 'a' }]);
    // @ts-expect-error: wrong value type
    clipPayload(Rows, [{ id: 1 }]);
    // @ts-expect-error: not a list
    clipPayload(Rows, { id: 'a' });
  });

  it('returns a payload every copy path accepts', () => {
    const Rows = defineClipFormat({ id: 'acme.rows', schema: (data: unknown) => data as string[] });
    const payload = clipPayload(Rows, ['a']);
    expectTypeOf(payload).toExtend<CopyPayload>();
    expectTypeOf(payload).toExtend<SyncCopyPayload>();
    expectTypeOf(payload).toExtend<DragCopyPayload>();
  });

  it('narrows read results by status', async () => {
    const Rows = defineClipFormat({ id: 'acme.rows', schema: (data: unknown) => data as Invoice[] });
    const result = await readClip({} as PasteResult, Rows);
    expectTypeOf(result).toEqualTypeOf<ClipReadResult<Invoice[]>>();
    expectTypeOf(readClipSync({} as DataTransfer, Rows)).toEqualTypeOf<ClipReadResult<Invoice[]>>();
    switch (result.status) {
      case 'ok':
        expectTypeOf(result.value).toEqualTypeOf<Invoice[]>();
        expectTypeOf(result.carrier).toEqualTypeOf<'web' | 'custom' | 'html'>();
        break;
      case 'invalid':
        expectTypeOf(result.issues[0]?.path).toEqualTypeOf<readonly PropertyKey[] | undefined>();
        break;
      case 'unsupported-version':
        expectTypeOf(result.version).toEqualTypeOf<number>();
        break;
      case 'absent':
        expectTypeOf(result).not.toHaveProperty('value');
        break;
      default:
        expectTypeOf(result).toEqualTypeOf<never>();
    }
  });

  it('accepts paste results, clip payloads and DataTransfers as sources', () => {
    const Rows = defineClipFormat({ id: 'acme.rows', schema: (data: unknown) => data as string[] });
    readClipSync(clipPayload(Rows, ['a']), Rows);
    readClipSync({ items: [{ type: 'text/html', data: '' }] }, Rows);
    // @ts-expect-error: not a source
    readClipSync('html', Rows);
  });

  it('builds an accept list for usePaste from formats of any value type', () => {
    const A = defineClipFormat({ id: 'acme.a', schema: (data: unknown) => data as number });
    const B = defineClipFormat({ id: 'acme.b', schema: z.object({ x: z.string() }) });
    expectTypeOf(clipAccept(A, B)).toEqualTypeOf<PasteAccept[]>();
  });

  it('rejects definitions with the wrong shape', () => {
    // @ts-expect-error: schema is required
    defineClipFormat({ id: 'acme.rows' });
    // @ts-expect-error: migrations are functions
    defineClipFormat({ id: 'acme.rows', schema: z.string(), migrate: { 1: 'up' } });
    // @ts-expect-error: text returns a string
    defineClipFormat({ id: 'acme.rows', schema: z.string(), text: (value) => value.length });
  });
});
