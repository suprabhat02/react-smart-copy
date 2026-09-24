/**
 * Type-level contract. Checked by `tsc --noEmit` (npm run typecheck), not vitest.
 * Every @ts-expect-error below MUST stay an error; if one starts compiling, the
 * API has silently loosened.
 */
import { expectTypeOf } from 'vitest';
import type {
  CopyErrorType,
  CopyInput,
  CopyOutcome,
  CopyPayload,
  CopySource,
  CopyState,
  UseCopyResult,
} from '../src';

export const text: CopyInput = 'shorthand';
export const html: CopyPayload = { kind: 'html', html: '<b>x</b>', text: 'x' };
export const lazy: CopySource = () => ({ kind: 'json', value: { id: 1 }, pretty: true });
export const image: CopyPayload = { kind: 'image', blob: async () => new Blob([], { type: 'image/png' }) };

// @ts-expect-error HTML requires a plain-text fallback.
export const htmlWithoutText: CopyPayload = { kind: 'html', html: '<b>x</b>' };

// @ts-expect-error Images need a Blob source, not a URL.
export const imageFromUrl: CopyPayload = { kind: 'image', blob: 'https://example.com/a.png' };

// @ts-expect-error Arbitrary file copy is not a thing the platform supports.
export const file: CopyPayload = { kind: 'file', file: new Blob() };

// @ts-expect-error Lazy sources must be synchronous to keep the user gesture.
export const asyncSource: CopySource = async () => 'late';

declare const state: CopyState;
if (state.status === 'error') {
  expectTypeOf(state.error.type).toEqualTypeOf<CopyErrorType>();
  expectTypeOf(state.payload).toEqualTypeOf<CopyPayload | null>();
}
if (state.status === 'copied') {
  expectTypeOf(state.at).toBeNumber();
  expectTypeOf(state.payload).toEqualTypeOf<CopyPayload>();
}
if (state.status === 'idle') {
  // @ts-expect-error Idle carries no payload.
  console.log(state.payload);
}

declare const hook: UseCopyResult;
expectTypeOf(hook.copy).returns.toEqualTypeOf<Promise<CopyOutcome>>();
