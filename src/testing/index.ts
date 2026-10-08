/**
 * `react-smart-copy/testing`
 *
 * Test utilities for consumers of react-smart-copy.
 *
 * - {@link createPasteResult} — build a complete {@link PasteResult} with sensible defaults
 *   so adding a new field in a future release never silently breaks your tests.
 * - {@link createMockPasteAdapter} — a controllable {@link PasteAdapter} for unit tests.
 * - {@link createMockClipboardAdapter} — a controllable {@link ClipboardAdapter} for unit tests.
 *
 * None of these modules import React or browser globals, so they work in Node / jsdom alike.
 *
 * @module
 */

import type { ClipboardAdapter } from '../core/clipboard-adapter';
import { CopyFailure, createCopyError, type CopyError } from '../core/errors';
import type { PasteAdapter } from '../core/paste-adapter';
import {
  completePasteResult,
  type PasteItem,
  type PasteReadResult,
  type PasteResult,
  type PasteSource,
} from '../core/paste-reader';
import type { CopyPayload } from '../core/payload';

/* ---------------------------------------------------------------- re-exports */

// Re-export the things consumers most commonly need in their test files, so
// they can use a single import path.
export type {
  ClipboardAdapter,
  CopyError,
  CopyPayload,
  PasteAdapter,
  PasteItem,
  PasteReadResult,
  PasteResult,
  PasteSource,
};
export { CopyFailure };

/* -------------------------------------------------------- createPasteResult */

/**
 * Input for {@link createPasteResult}: every field is optional so callers
 * only specify what the test cares about.
 */
export interface PasteResultInit {
  readonly source?: PasteSource;
  readonly items?: readonly PasteItem[];
  readonly text?: string | null;
  readonly html?: string | null;
  readonly images?: readonly Blob[];
  readonly files?: readonly File[];
}

/**
 * Builds a complete, self-consistent {@link PasteResult} with sensible defaults.
 *
 * Prefer this over constructing `PasteResult` literals: when the library adds
 * a field (as it did in v1.3.0 and v1.4.0), your tests stay green without any
 * change on your end.
 *
 * ```ts
 * const result = createPasteResult({ text: 'hello', source: 'clipboard' });
 * // result.source     → 'clipboard'
 * // result.text       → 'hello'
 * // result.html       → null
 * // result.images     → []
 * // result.files      → []
 * // result.imageFiles → []
 * // result.items      → [{ type: 'text/plain', data: 'hello' }]
 * ```
 *
 * When `items` is not supplied it is derived from `text`, `html`, and `images`:
 * a `text/plain` entry for `text`, a `text/html` entry for `html`, and one
 * entry per image Blob. `imageFiles` is always computed from the intersection
 * of `images` and `files`, exactly as the machine does.
 *
 * @public
 */
export function createPasteResult(init: PasteResultInit = {}): PasteResult {
  const source: PasteSource = init.source ?? 'clipboard';
  const text: string | null = init.text ?? null;
  const html: string | null = init.html ?? null;
  const images: readonly Blob[] = init.images ?? [];
  const files: readonly File[] = init.files ?? [];

  let items: readonly PasteItem[];
  if (init.items !== undefined) {
    items = init.items;
  } else {
    const derived: PasteItem[] = [];
    if (text !== null) derived.push({ type: 'text/plain', data: text });
    if (html !== null) derived.push({ type: 'text/html', data: html });
    for (const blob of images) derived.push({ type: blob.type || 'image/png', data: blob });
    items = derived;
  }

  const partial: PasteReadResult = { source, items, text, html, images, files };
  return completePasteResult(partial);
}

/* -------------------------------------------------- createMockPasteAdapter */

/**
 * A queue entry for the mock paste adapter: a {@link PasteReadResult} resolves
 * the next `read()` call; a {@link CopyError} rejects it.
 */
export type MockPasteEntry = PasteReadResult | CopyError;

/**
 * The handle returned by {@link createMockPasteAdapter}.
 * @public
 */
export interface MockPasteAdapter {
  /** The adapter itself: pass this as `adapter` in machine / hook options. */
  readonly adapter: PasteAdapter;
  /**
   * Queue a successful result. When the adapter's `read()` is next called it
   * resolves with this value.
   */
  readonly queueResult: (result: PasteReadResult) => void;
  /**
   * Queue an error. When `read()` is next called it rejects with a
   * `CopyFailure` wrapping this error, which the machine maps to `error` state.
   */
  readonly queueError: (error: CopyError) => void;
  /**
   * How many times `read()` was called. Useful for asserting that the machine
   * did (or didn't) retry.
   */
  readonly readCount: () => number;
  /** Drain all pending queue entries and reset the read counter. */
  readonly reset: () => void;
}

/**
 * Creates a controllable paste adapter for unit tests.
 *
 * ```ts
 * const mock = createMockPasteAdapter();
 * mock.queueResult(createPasteResult({ text: 'hello' }));
 *
 * const machine = createPasteMachine({ adapter: mock.adapter });
 * await machine.paste();
 *
 * expect(machine.getSnapshot().status).toBe('read');
 * expect(mock.readCount()).toBe(1);
 * ```
 *
 * If `read()` is called when the queue is empty it rejects with a
 * `'no-content'` error so the machine transitions to `error` rather than
 * throwing.
 *
 * @public
 */
export function createMockPasteAdapter(): MockPasteAdapter {
  const queue: MockPasteEntry[] = [];
  let reads = 0;

  function isCopyError(entry: MockPasteEntry): entry is CopyError {
    return 'type' in entry && 'message' in entry && !('source' in entry);
  }

  const adapter: PasteAdapter = {
    read: (_options, context): Promise<PasteReadResult> => {
      reads += 1;

      if (context?.signal.aborted) {
        return Promise.reject(new CopyFailure(createCopyError('aborted', 'The paste was cancelled.')));
      }

      const entry = queue.shift();
      if (entry === undefined) {
        return Promise.reject(
          new CopyFailure(createCopyError('no-content', 'Mock paste adapter: queue is empty.')),
        );
      }

      if (isCopyError(entry)) {
        return Promise.reject(new CopyFailure(entry));
      }

      return Promise.resolve(entry);
    },
  };

  return {
    adapter,
    queueResult: (result) => { queue.push(result); },
    queueError: (error) => { queue.push(error); },
    readCount: () => reads,
    reset: () => {
      queue.length = 0;
      reads = 0;
    },
  };
}

/* ----------------------------------------------- createMockClipboardAdapter */

/**
 * The handle returned by {@link createMockClipboardAdapter}.
 * @public
 */
export interface MockClipboardAdapter {
  /** The adapter itself: pass this as `adapter` in machine / hook options. */
  readonly adapter: ClipboardAdapter;
  /**
   * Queue a successful write. When `write()` is next called it resolves;
   * the payload the machine sends is captured in {@link lastPayload}.
   */
  readonly queueSuccess: () => void;
  /**
   * Queue a write error. When `write()` is next called it rejects with a
   * `CopyFailure` wrapping this error, which the machine maps to `error` state.
   */
  readonly queueError: (error: CopyError) => void;
  /**
   * The payload from the most recent `write()` call, or `undefined` if
   * `write()` has not been called yet (or after `reset()`).
   */
  readonly lastPayload: () => CopyPayload | undefined;
  /** How many times `write()` was called. */
  readonly writeCount: () => number;
  /** Drain pending queue entries and clear captured payload and write counter. */
  readonly reset: () => void;
}

type ClipboardQueueEntry = { readonly ok: true } | { readonly ok: false; readonly error: CopyError };

/**
 * Creates a controllable clipboard adapter for unit tests.
 *
 * ```ts
 * const mock = createMockClipboardAdapter();
 * mock.queueSuccess();
 *
 * const machine = createCopyMachine({ payload: 'hello', adapter: mock.adapter });
 * await machine.copy();
 *
 * expect(machine.getSnapshot().status).toBe('copied');
 * expect(mock.lastPayload()).toEqual({ kind: 'text', value: 'hello' });
 * ```
 *
 * If `write()` is called when the queue is empty it rejects with an `'unknown'`
 * error so the machine transitions to `error` rather than throwing.
 *
 * @public
 */
export function createMockClipboardAdapter(): MockClipboardAdapter {
  const queue: ClipboardQueueEntry[] = [];
  let writes = 0;
  let last: CopyPayload | undefined;

  const adapter: ClipboardAdapter = {
    write: (payload): Promise<void> => {
      writes += 1;
      last = payload;

      const entry = queue.shift();
      if (entry === undefined) {
        return Promise.reject(
          new CopyFailure(createCopyError('unknown', 'Mock clipboard adapter: queue is empty.')),
        );
      }

      if (!entry.ok) {
        return Promise.reject(new CopyFailure(entry.error));
      }
      return Promise.resolve();
    },
  };

  return {
    adapter,
    queueSuccess: () => { queue.push({ ok: true }); },
    queueError: (error) => { queue.push({ ok: false, error }); },
    lastPayload: () => last,
    writeCount: () => writes,
    reset: () => {
      queue.length = 0;
      writes = 0;
      last = undefined;
    },
  };
}
