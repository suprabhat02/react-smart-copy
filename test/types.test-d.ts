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
// `dropped` is optional, so a full messages object written for 1.3 still compiles.
export const messages13: PasteFieldMessages = {
  pasted: 'Pasted',
  error: () => 'Failed',
  triggerLabel: (label) => label,
  zoneLabel: (label) => label,
};

/* ── Testing utilities (v1.5) ───────────────────────────────────────── */

import {
  CopyFailure as TestingCopyFailure,
  createMockClipboardAdapter,
  createMockPasteAdapter,
  createPasteResult,
  type MockClipboardAdapter,
  type MockPasteAdapter,
  type PasteResultInit,
} from '../src/testing/index';
import type { ClipboardAdapter } from '../src/core/clipboard-adapter';
import type { PasteAdapter as CorePasteAdapter } from '../src/core/paste-adapter';

// createPasteResult returns a full PasteResult
expectTypeOf(createPasteResult()).toEqualTypeOf<PasteResult>();
expectTypeOf(createPasteResult({ text: 'hi' })).toEqualTypeOf<PasteResult>();
// PasteResultInit fields are all optional
expectTypeOf<PasteResultInit>().toHaveProperty('source').toEqualTypeOf<PasteSource | undefined>();
expectTypeOf<PasteResultInit>().toHaveProperty('text').toEqualTypeOf<string | null | undefined>();
expectTypeOf<PasteResultInit>().toHaveProperty('html').toEqualTypeOf<string | null | undefined>();
expectTypeOf<PasteResultInit>().toHaveProperty('images').toEqualTypeOf<readonly Blob[] | undefined>();

// MockPasteAdapter has correct shape
const mockPaste: MockPasteAdapter = createMockPasteAdapter();
expectTypeOf(mockPaste.readCount).returns.toEqualTypeOf<number>();
expectTypeOf(mockPaste.adapter).toEqualTypeOf<CorePasteAdapter>();

// MockClipboardAdapter has correct shape
const mockCopy: MockClipboardAdapter = createMockClipboardAdapter();
expectTypeOf(mockCopy.writeCount).returns.toEqualTypeOf<number>();
expectTypeOf(mockCopy.lastPayload).returns.toEqualTypeOf<CopyPayload | undefined>();
expectTypeOf(mockCopy.adapter).toEqualTypeOf<ClipboardAdapter>();

// CopyFailure is re-exported and constructable
const failure = new TestingCopyFailure({ type: 'aborted', message: 'test' });
expectTypeOf(failure.copyError.type).toEqualTypeOf<CopyErrorType>();

/* ── Native copy interception (v1.7) ────────────────────────────────── */

import type {
  CopyEventLike,
  CopyInterceptOutcome,
  CopyInterceptTransform,
  CopySelection,
  SyncCopyPayload,
} from '../src/core/copy-interceptor';
import type { UseCopyInterceptorResult } from '../src/react/useCopyInterceptor';
import type { ClipboardEvent as ReactClipboardEvent, RefCallback } from 'react';
import { useCopyInterceptor as useInterceptorExport, registerCopyInterceptor as registerExport } from '../src';

// Transforms may return a string, a sync payload, false (block) or nothing (pass through).
export const passThrough: CopyInterceptTransform = ({ text }) => {
  if (text.length > 1000) return `${text.slice(0, 1000)}…`;
  return undefined;
};
export const block: CopyInterceptTransform = () => false;
export const asHtml: CopyInterceptTransform = ({ text }) => ({ kind: 'html', html: `<q>${text}</q>`, text });
export const asTsv: CopyInterceptTransform = () => ({ kind: 'multi', items: [{ mimeType: 'text/plain', data: 'a\tb' }] });

// @ts-expect-error The clipboard closes when the event returns: transforms must be synchronous.
export const asyncTransform: CopyInterceptTransform = async () => 'late';
// @ts-expect-error Images cannot be written synchronously; use useCopy() instead.
export const imageTransform: CopyInterceptTransform = () => ({ kind: 'image', blob: new Blob() });
// @ts-expect-error Multi items must be strings during a copy event.
export const blobItem: SyncCopyPayload = { kind: 'multi', items: [{ mimeType: 'image/png', data: new Blob() }] };
// @ts-expect-error `true` is meaningless: return a payload, false, or nothing.
export const trueTransform: CopyInterceptTransform = () => true;

declare const selection: CopySelection;
expectTypeOf(selection.kind).toEqualTypeOf<'copy' | 'cut'>();
expectTypeOf(selection.html).toEqualTypeOf<string | null>();
expectTypeOf(selection.fragment).toEqualTypeOf<DocumentFragment | null>();

// DOM and React clipboard events both satisfy the structural event type.
expectTypeOf<ClipboardEvent>().toExtend<CopyEventLike>();
expectTypeOf<ReactClipboardEvent<HTMLDivElement>>().toExtend<CopyEventLike>();

declare const outcome: CopyInterceptOutcome;
if (outcome.status === 'written') {
  expectTypeOf(outcome.payload).toEqualTypeOf<SyncCopyPayload>();
  expectTypeOf(outcome.deleted).toBeBoolean();
}
if (outcome.status === 'failed') {
  expectTypeOf(outcome.fallback).toEqualTypeOf<'block' | 'native'>();
  expectTypeOf(outcome.error.type).toEqualTypeOf<CopyErrorType>();
}
if (outcome.status === 'passed') {
  // @ts-expect-error Only `written` carries a payload.
  console.log(outcome.payload);
}

expectTypeOf<UseCopyInterceptorResult<HTMLElement>['ref']>().toEqualTypeOf<RefCallback<HTMLElement>>();
expectTypeOf(useInterceptorExport).toBeFunction();
expectTypeOf(registerExport).returns.toEqualTypeOf<() => void>();

/* ── Drag-and-drop copy (v1.8) ───────────────────────────────────────── */

import type {
  DragCopyOutcome,
  DragCopyPayload,
  DragCopySource,
  DragCopyState,
  DragCopyStatus,
  DragStartEventLike,
} from '../src/core/drag-copy';
import type { UseDragCopyOptions, UseDragCopyResult } from '../src/react/useDragCopy';
import { useDragCopy } from '../src';

// Sources may return a string, a structured payload, false (decline), or null/undefined (pass).
export const textSource: DragCopySource = () => 'plain text';
export const htmlDragSource: DragCopySource = () => ({ kind: 'html', html: '<b>hi</b>', text: 'hi' });
export const jsonDragSource: DragCopySource = () => ({ kind: 'json', value: { id: 1 } });
export const multiDragSource: DragCopySource = () => ({
  kind: 'multi',
  items: [{ mimeType: 'text/plain', data: 'a' }],
});
export const declineDragSource: DragCopySource = () => false;
export const passDragSource: DragCopySource = () => null;

// @ts-expect-error Sources must be synchronous.
export const asyncDragSource: DragCopySource = async () => 'late';

// DragCopyStatus is the three-state union.
expectTypeOf<DragCopyStatus>().toEqualTypeOf<'idle' | 'dragging' | 'done'>();

// DragCopyState always has a status and a nullable outcome.
declare const dragState: DragCopyState;
expectTypeOf(dragState.status).toEqualTypeOf<DragCopyStatus>();
expectTypeOf(dragState.outcome).toEqualTypeOf<DragCopyOutcome | null>();

// Narrowing DragCopyOutcome.
declare const dragOutcome: DragCopyOutcome;
if (dragOutcome.status === 'written') {
  expectTypeOf(dragOutcome.payload).toEqualTypeOf<DragCopyPayload>();
}
if (dragOutcome.status === 'passed') {
  expectTypeOf(dragOutcome.reason).toEqualTypeOf<'declined' | 'no-transfer' | 'cancelled'>();
}
if (dragOutcome.status === 'failed') {
  expectTypeOf(dragOutcome.error.type).toEqualTypeOf<CopyErrorType>();
}
// `passed` does not carry a payload — the property doesn't exist on the type.
type _PassedHasNoPayload = 'payload' extends keyof Extract<DragCopyOutcome, { status: 'passed' }> ? never : true;
declare const _passedNoPayload: _PassedHasNoPayload;
expectTypeOf(_passedNoPayload).toEqualTypeOf<true>();

// DOM and React drag events both satisfy the structural event type.
expectTypeOf<DragEvent>().toExtend<DragStartEventLike>();
expectTypeOf<ReactDragEvent<HTMLDivElement>>().toExtend<DragStartEventLike>();

// useDragCopy returns a ref, status, outcome, and an onDragStart handler.
declare const dragHook: UseDragCopyResult;
expectTypeOf(dragHook.ref).toEqualTypeOf<RefCallback<HTMLElement>>();
expectTypeOf(dragHook.status).toEqualTypeOf<DragCopyStatus>();
expectTypeOf(dragHook.outcome).toEqualTypeOf<DragCopyOutcome | null>();
expectTypeOf(dragHook.onDragStart).parameter(0).toExtend<DragStartEventLike>();

// The hook is callable and re-exported from the public surface.
expectTypeOf(useDragCopy).toBeFunction();

// enabled is optional.
const _opts: UseDragCopyOptions = { source: () => 'x' };
const _optsDisabled: UseDragCopyOptions = { source: () => 'x', enabled: false };
