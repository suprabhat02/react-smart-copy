/**
 * Type-level contract. Checked by `tsc --noEmit` (npm run typecheck), not vitest.
 * Every @ts-expect-error below MUST stay an error; if one starts compiling, the
 * API has silently loosened.
 */
import { expectTypeOf } from 'vitest';
import type {
  CopyCancelReason,
  CopyErrorType,
  CopyInput,
  CopyOutcome,
  CopyPayload,
  CopySource,
  CopyState,
  PasteCancelReason,
  UseCopyOptions,
  UseCopyResult,
  UsePasteOptions,
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

/* ------------------------------------------------------------------ Paste */

import type {
  BlobSource,
  OperationContext,
  PasteAdapter,
  PasteFieldPreviewRenderProps,
  PasteOutcome,
  PasteReadResult,
  PasteResult,
  PasteSource,
  PasteState,
  UsePasteResult,
} from '../src';

declare const pasteState: PasteState;
if (pasteState.status === 'read') {
  expectTypeOf(pasteState.result).toEqualTypeOf<PasteResult>();
  expectTypeOf(pasteState.at).toBeNumber();
}
if (pasteState.status === 'error') {
  expectTypeOf(pasteState.error.type).toEqualTypeOf<CopyErrorType>();
  expectTypeOf(pasteState.source).toEqualTypeOf<PasteSource>();
  expectTypeOf(pasteState.retryCount).toBeNumber();
}
// @ts-expect-error Only `read` carries a result.
export const noResult = pasteState.status === 'error' && pasteState.result;

declare const pasteOutcome: PasteOutcome;
if (pasteOutcome.status === 'ignored') {
  expectTypeOf(pasteOutcome.reason).toEqualTypeOf<
    'in-flight' | 'no-accepted-content' | 'nothing-to-retry' | 'not-retryable' | 'cancelled'
  >();
}

declare const pasteHook: UsePasteResult;
expectTypeOf(pasteHook.retry).returns.resolves.toEqualTypeOf<PasteOutcome>();
expectTypeOf(pasteHook.canRetry).toBeBoolean();
expectTypeOf(pasteHook.result).toEqualTypeOf<PasteResult | null>();

declare const pasted: PasteResult;
expectTypeOf(pasted.imageFiles).toEqualTypeOf<readonly File[]>();
// @ts-expect-error The result is read-only.
pasted.imageFiles = [];

// Adapters written before 1.3 resolve without `imageFiles`; the machine derives it.
declare const before13: Omit<PasteResult, 'imageFiles'>;
export const adapterWithoutImageFiles: PasteAdapter = { read: () => Promise.resolve(before13) };
export const adapterWithFullResult: PasteAdapter = { read: () => Promise.resolve(pasted) };
expectTypeOf<PasteReadResult>().toEqualTypeOf<Omit<PasteResult, 'imageFiles'>>();

// Adapters written before 1.2 (no context parameter) still satisfy the contract.
export const legacyAdapter: PasteAdapter = { read: () => Promise.reject(new Error('x')) };
export const signalAwareAdapter: PasteAdapter = {
  read: (_options, context) => {
    expectTypeOf(context).toEqualTypeOf<OperationContext | undefined>();
    return Promise.reject(new Error('x'));
  },
};

// Lazy image sources may take the copy's context, or ignore it.
export const zeroArgSource: BlobSource = () => new Blob([], { type: 'image/png' });
export const contextSource: BlobSource = (context) => {
  expectTypeOf(context).toEqualTypeOf<OperationContext | undefined>();
  return new Blob([], { type: 'image/png' });
};

declare const previewProps: PasteFieldPreviewRenderProps;
expectTypeOf(previewProps.imageUrls).toEqualTypeOf<readonly string[]>();

/* ── Lifecycle callbacks (v1.3) ─────────────────────────────────────── */

expectTypeOf<CopyCancelReason>().toEqualTypeOf<'reset' | 'disconnect'>();
expectTypeOf<PasteCancelReason>().toEqualTypeOf<'reset' | 'disconnect' | 'superseded'>();
expectTypeOf<NonNullable<UseCopyOptions['onReset']>>().toEqualTypeOf<() => void>();
expectTypeOf<NonNullable<UseCopyOptions['onCancel']>>().parameter(0).toEqualTypeOf<CopyCancelReason>();
expectTypeOf<NonNullable<UsePasteOptions['onCancel']>>().parameter(0).toEqualTypeOf<PasteCancelReason>();

// @ts-expect-error A copy is never superseded: a second copy() while copying is ignored instead.
export const copyCannotBeSuperseded: CopyCancelReason = 'superseded';

/* ── Drag-and-drop (v1.4) ───────────────────────────────────────────── */

import type { PasteDropEventLike, PasteDropTargetProps, PasteFieldMessages } from '../src';
import type { DragEvent as ReactDragEvent } from 'react';

expectTypeOf<PasteSource>().toEqualTypeOf<'clipboard' | 'event' | 'drop'>();
expectTypeOf(pasteHook.isDragOver).toBeBoolean();
expectTypeOf(pasteHook.dropTargetProps).toEqualTypeOf<PasteDropTargetProps<HTMLElement>>();
expectTypeOf(pasteHook.dropEvent).returns.resolves.toEqualTypeOf<PasteOutcome>();
// React drop events (and DOM DragEvents) satisfy the structural event type.
expectTypeOf<ReactDragEvent<HTMLDivElement>>().toExtend<PasteDropEventLike>();
expectTypeOf<DragEvent>().toExtend<PasteDropEventLike>();
// Error formatters written before 1.4 take only the error, and still fit.
export const legacyErrorMessage: Partial<PasteFieldMessages> = { error: (error) => error.type };
// @ts-expect-error Drop events need their `dataTransfer`, not `clipboardData`.
export const notADrop: PasteDropEventLike = { clipboardData: null, preventDefault: () => undefined };
