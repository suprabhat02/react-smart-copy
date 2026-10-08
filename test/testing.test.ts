/**
 * Tests for `react-smart-copy/testing`.
 *
 * Exercises every exported symbol through its public API so v8 coverage reaches 100%.
 */
import { describe, expect, it } from 'vitest';
import type { CopyPayload } from '../src/core/payload';
import { createCopyMachine } from '../src/core/copy-machine';
import { createPasteMachine } from '../src/core/paste-machine';
import { createCopyError } from '../src/core/errors';
import {
  CopyFailure,
  createMockClipboardAdapter,
  createMockPasteAdapter,
  createPasteResult,
  type MockClipboardAdapter,
  type MockPasteAdapter,
  type PasteResultInit,
} from '../src/testing/index';
import { pngBlob, pngFile } from './fixtures';

/* ================================================================ createPasteResult */

describe('createPasteResult', () => {
  it('returns idle defaults when called with no arguments', () => {
    const result = createPasteResult();
    expect(result.source).toBe('clipboard');
    expect(result.text).toBeNull();
    expect(result.html).toBeNull();
    expect(result.images).toEqual([]);
    expect(result.files).toEqual([]);
    expect(result.imageFiles).toEqual([]);
    expect(result.items).toEqual([]);
  });

  it('builds items from text', () => {
    const result = createPasteResult({ text: 'hello' });
    expect(result.text).toBe('hello');
    expect(result.items).toEqual([{ type: 'text/plain', data: 'hello' }]);
    expect(result.html).toBeNull();
  });

  it('builds items from html', () => {
    const result = createPasteResult({ html: '<b>hi</b>' });
    expect(result.html).toBe('<b>hi</b>');
    expect(result.items).toEqual([{ type: 'text/html', data: '<b>hi</b>' }]);
    expect(result.text).toBeNull();
  });

  it('builds items from both text and html', () => {
    const result = createPasteResult({ text: 'hi', html: '<b>hi</b>' });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({ type: 'text/plain', data: 'hi' });
    expect(result.items[1]).toEqual({ type: 'text/html', data: '<b>hi</b>' });
  });

  it('includes images in items', () => {
    const blob = pngBlob();
    const result = createPasteResult({ images: [blob] });
    expect(result.images).toEqual([blob]);
    expect(result.items).toEqual([{ type: 'image/png', data: blob }]);
  });

  it('falls back to image/png when blob.type is empty', () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: '' });
    const result = createPasteResult({ images: [blob] });
    expect(result.items[0]?.type).toBe('image/png');
  });

  it('respects explicit items over derived ones', () => {
    const custom = [{ type: 'application/json', data: '{"x":1}' }] as const;
    const result = createPasteResult({ text: 'ignored', items: custom });
    expect(result.items).toEqual(custom);
    // text still set from init even when items is supplied
    expect(result.text).toBe('ignored');
  });

  it('sets source to "event" or "drop"', () => {
    expect(createPasteResult({ source: 'event' }).source).toBe('event');
    expect(createPasteResult({ source: 'drop' }).source).toBe('drop');
  });

  it('computes imageFiles as intersection of images and files', () => {
    const file = pngFile();
    const otherBlob = pngBlob();
    const result = createPasteResult({ images: [file, otherBlob], files: [file] });
    expect(result.imageFiles).toEqual([file]);
    expect(result.images).toHaveLength(2);
  });

  it('imageFiles is empty when no files match images', () => {
    const blob = pngBlob();
    const result = createPasteResult({ images: [blob], files: [] });
    expect(result.imageFiles).toEqual([]);
  });

  it('explicit null for text and html passes through', () => {
    const result = createPasteResult({ text: null, html: null });
    expect(result.text).toBeNull();
    expect(result.html).toBeNull();
    expect(result.items).toEqual([]);
  });
});

/* ============================================================ createMockPasteAdapter */

describe('createMockPasteAdapter', () => {
  const makeOptions = () => ({ accept: ['text/plain'], maxBytes: 32 * 1024 * 1024, maxItems: 32 });

  it('exposes an adapter property', () => {
    const mock = createMockPasteAdapter();
    expect(typeof mock.adapter.read).toBe('function');
  });

  it('resolves with a queued result', async () => {
    const mock = createMockPasteAdapter();
    const result = createPasteResult({ text: 'hello' });
    mock.queueResult(result);
    const out = await mock.adapter.read(makeOptions());
    expect(out.text).toBe('hello');
  });

  it('rejects with a queued error', async () => {
    const mock = createMockPasteAdapter();
    mock.queueError(createCopyError('permission-denied', 'no access'));
    await expect(mock.adapter.read(makeOptions())).rejects.toMatchObject({
      copyError: { type: 'permission-denied' },
    });
  });

  it('rejects with no-content when queue is empty', async () => {
    const mock = createMockPasteAdapter();
    await expect(mock.adapter.read(makeOptions())).rejects.toMatchObject({
      copyError: { type: 'no-content' },
    });
  });

  it('counts reads', async () => {
    const mock = createMockPasteAdapter();
    mock.queueResult(createPasteResult({ text: 'a' }));
    mock.queueResult(createPasteResult({ text: 'b' }));
    expect(mock.readCount()).toBe(0);
    await mock.adapter.read(makeOptions());
    expect(mock.readCount()).toBe(1);
    await mock.adapter.read(makeOptions()).catch(() => undefined); // empty queue fallthrough
    expect(mock.readCount()).toBe(2);
  });

  it('drains queue and resets counter on reset()', async () => {
    const mock = createMockPasteAdapter();
    mock.queueResult(createPasteResult({ text: 'x' }));
    await mock.adapter.read(makeOptions());
    mock.reset();
    expect(mock.readCount()).toBe(0);
    // Queue should be empty: next read hits the empty-queue rejection
    await expect(mock.adapter.read(makeOptions())).rejects.toMatchObject({
      copyError: { type: 'no-content' },
    });
    // readCount incremented even after reset
    expect(mock.readCount()).toBe(1);
  });

  it('rejects with aborted when signal is already aborted', async () => {
    const mock = createMockPasteAdapter();
    mock.queueResult(createPasteResult({ text: 'x' }));
    const controller = new AbortController();
    controller.abort();
    await expect(mock.adapter.read(makeOptions(), { signal: controller.signal })).rejects.toMatchObject({
      copyError: { type: 'aborted' },
    });
  });

  it('queued results are consumed in order (FIFO)', async () => {
    const mock = createMockPasteAdapter();
    mock.queueResult(createPasteResult({ text: 'first' }));
    mock.queueResult(createPasteResult({ text: 'second' }));
    const a = await mock.adapter.read(makeOptions());
    const b = await mock.adapter.read(makeOptions());
    expect(a.text).toBe('first');
    expect(b.text).toBe('second');
  });

  it('works end-to-end with createPasteMachine', async () => {
    const mock = createMockPasteAdapter();
    mock.queueResult(createPasteResult({ text: 'world' }));

    const machine = createPasteMachine({ adapter: mock.adapter });
    const outcome = await machine.paste();

    expect(outcome.status).toBe('read');
    if (outcome.status === 'read') {
      expect(outcome.result.text).toBe('world');
    }
    expect(mock.readCount()).toBe(1);
  });

  it('machine lands in error state on queued adapter error', async () => {
    const mock = createMockPasteAdapter();
    mock.queueError(createCopyError('timeout', 'timed out'));

    const machine = createPasteMachine({ adapter: mock.adapter });
    const outcome = await machine.paste();

    expect(outcome.status).toBe('error');
    if (outcome.status === 'error') {
      expect(outcome.error.type).toBe('timeout');
    }
  });

  it('empty queue error lands machine in error state (not thrown)', async () => {
    const mock = createMockPasteAdapter();
    const machine = createPasteMachine({ adapter: mock.adapter });
    const outcome = await machine.paste();
    expect(outcome.status).toBe('error');
    if (outcome.status === 'error') {
      expect(outcome.error.type).toBe('no-content');
    }
  });
});

/* ========================================================= createMockClipboardAdapter */

describe('createMockClipboardAdapter', () => {
  const textPayload: CopyPayload = { kind: 'text', value: 'hello' };

  it('exposes an adapter property', () => {
    const mock = createMockClipboardAdapter();
    expect(typeof mock.adapter.write).toBe('function');
  });

  it('resolves on queueSuccess', async () => {
    const mock = createMockClipboardAdapter();
    mock.queueSuccess();
    await expect(mock.adapter.write(textPayload)).resolves.toBeUndefined();
  });

  it('rejects on queueError', async () => {
    const mock = createMockClipboardAdapter();
    mock.queueError(createCopyError('permission-denied', 'blocked'));
    await expect(mock.adapter.write(textPayload)).rejects.toMatchObject({
      copyError: { type: 'permission-denied' },
    });
  });

  it('rejects with unknown when queue is empty', async () => {
    const mock = createMockClipboardAdapter();
    await expect(mock.adapter.write(textPayload)).rejects.toMatchObject({
      copyError: { type: 'unknown' },
    });
  });

  it('captures lastPayload', async () => {
    const mock = createMockClipboardAdapter();
    mock.queueSuccess();
    expect(mock.lastPayload()).toBeUndefined();
    await mock.adapter.write(textPayload);
    expect(mock.lastPayload()).toEqual(textPayload);
  });

  it('captures lastPayload even on error', async () => {
    const mock = createMockClipboardAdapter();
    mock.queueError(createCopyError('timeout', 'slow'));
    await mock.adapter.write(textPayload).catch(() => undefined);
    expect(mock.lastPayload()).toEqual(textPayload);
  });

  it('captures lastPayload on empty-queue rejection', async () => {
    const mock = createMockClipboardAdapter();
    await mock.adapter.write(textPayload).catch(() => undefined);
    expect(mock.lastPayload()).toEqual(textPayload);
  });

  it('counts writes', async () => {
    const mock = createMockClipboardAdapter();
    mock.queueSuccess();
    mock.queueSuccess();
    expect(mock.writeCount()).toBe(0);
    await mock.adapter.write(textPayload);
    expect(mock.writeCount()).toBe(1);
    await mock.adapter.write(textPayload).catch(() => undefined);
    expect(mock.writeCount()).toBe(2);
  });

  it('drains queue and resets state on reset()', async () => {
    const mock = createMockClipboardAdapter();
    mock.queueSuccess();
    await mock.adapter.write(textPayload);
    mock.reset();
    expect(mock.writeCount()).toBe(0);
    expect(mock.lastPayload()).toBeUndefined();
    // Queue drained: next write hits empty-queue rejection
    await expect(mock.adapter.write(textPayload)).rejects.toMatchObject({
      copyError: { type: 'unknown' },
    });
  });

  it('consumes queue entries in FIFO order', async () => {
    const mock = createMockClipboardAdapter();
    mock.queueSuccess();
    mock.queueError(createCopyError('timeout', 't'));
    await expect(mock.adapter.write(textPayload)).resolves.toBeUndefined();
    await expect(mock.adapter.write(textPayload)).rejects.toMatchObject({
      copyError: { type: 'timeout' },
    });
  });

  it('works end-to-end with createCopyMachine', async () => {
    const mock = createMockClipboardAdapter();
    mock.queueSuccess();

    const machine = createCopyMachine({ adapter: mock.adapter });
    const outcome = await machine.copy('hello');

    expect(outcome.status).toBe('copied');
    expect(mock.writeCount()).toBe(1);
    expect(mock.lastPayload()).toEqual({ kind: 'text', value: 'hello' });
  });

  it('machine lands in error state on adapter error', async () => {
    const mock = createMockClipboardAdapter();
    mock.queueError(createCopyError('not-focused', 'no focus'));

    const machine = createCopyMachine({ adapter: mock.adapter });
    const outcome = await machine.copy('hello');

    expect(outcome.status).toBe('error');
    if (outcome.status === 'error') {
      expect(outcome.error.type).toBe('not-focused');
    }
  });
});

/* ================================================================== re-exports */

describe('re-exports', () => {
  it('re-exports CopyFailure', () => {
    const failure = new CopyFailure(createCopyError('aborted', 'test'));
    expect(failure.name).toBe('CopyFailure');
    expect(failure.copyError.type).toBe('aborted');
  });

  it('re-exported types are assignable (type-level, tested at compile time via usage)', () => {
    // Exercised by the typed usages above; this test exists for coverage of the import.
    const mock: MockPasteAdapter = createMockPasteAdapter();
    const cmock: MockClipboardAdapter = createMockClipboardAdapter();
    const _init: PasteResultInit = {};
    expect(mock).toBeDefined();
    expect(cmock).toBeDefined();
    expect(_init).toBeDefined();
  });
});
