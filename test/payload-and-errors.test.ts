import { describe, expect, it } from 'vitest';
import {
  CopyFailure,
  createCopyError,
  describeCopyError,
  isCopyFailure,
  isRetryableError,
  toCopyError,
  validatePayload,
  type CopyErrorType,
} from '../src/core';

describe('validatePayload', () => {
  it.each([
    [{ kind: 'text', value: 'x' }],
    [{ kind: 'html', html: '<b>x</b>', text: 'x' }],
    [{ kind: 'image', blob: new Blob([], { type: 'image/png' }) }],
    [{ kind: 'image', blob: () => new Blob() }],
    [{ kind: 'image', blob: Promise.resolve(new Blob()) }],
    [{ kind: 'json', value: null }],
    [{ kind: 'multi', items: [{ mimeType: 'text/plain', data: 'x' }] }],
  ])('accepts %j', (payload) => {
    expect(validatePayload(payload)).toBeNull();
  });

  it.each([
    [null],
    ['raw string is normalised before validation'],
    [{ kind: 'text', value: '' }],
    [{ kind: 'html', html: '<b>x</b>' }],
    [{ kind: 'html', html: '', text: 'x' }],
    [{ kind: 'image', blob: 'data:image/png;base64,' }],
    [{ kind: 'json', value: undefined }],
    [{ kind: 'multi', items: [] }],
    [{ kind: 'multi', items: [{ mimeType: 'text/plain', data: 1 }] }],
    [{ kind: 'multi', items: [{ mimeType: 'a', data: 'x' }, { mimeType: 'a', data: 'y' }] }],
    [{ kind: 'file', file: 'x' }],
  ])('rejects %j', (payload) => {
    expect(validatePayload(payload)).toMatchObject({ type: 'invalid-payload' });
  });
});

describe('toCopyError', () => {
  it.each<[unknown, CopyErrorType]>([
    [{ name: 'NotAllowedError', message: 'Write permission denied.' }, 'permission-denied'],
    [{ name: 'NotAllowedError', message: 'Document is not focused.' }, 'not-focused'],
    [{ name: 'SecurityError', message: '' }, 'insecure-context'],
    [{ name: 'NotSupportedError', message: '' }, 'unsupported-format'],
    [{ name: 'DataError', message: '' }, 'unsupported-format'],
    [new Error('weird'), 'unknown'],
    ['a string', 'unknown'],
    [undefined, 'unknown'],
  ])('maps %j to %s', (cause, type) => {
    expect(toCopyError(cause).type).toBe(type);
  });

  it('unwraps CopyFailure, including across duplicated bundles (brand check)', () => {
    const error = createCopyError('unsupported', 'x');
    expect(toCopyError(new CopyFailure(error))).toBe(error);
    const foreign = Object.assign(Object.create(null) as object, {
      [Symbol.for('react-smart-copy.CopyFailure')]: true,
      copyError: error,
    });
    expect(isCopyFailure(foreign)).toBe(true);
  });
});

describe('error helpers', () => {
  const all: CopyErrorType[] = [
    'unsupported',
    'insecure-context',
    'permission-denied',
    'not-focused',
    'invalid-payload',
    'unsupported-format',
    'blob-generation-failed',
    'max-retries-exceeded',
    'unknown',
  ];

  it('has a user-facing description for every error type', () => {
    for (const type of all) expect(describeCopyError(createCopyError(type, '')).length).toBeGreaterThan(0);
  });

  it('only marks transient errors as retryable', () => {
    const retryable = all.filter((type) => isRetryableError(createCopyError(type, '')));
    expect(retryable.sort()).toEqual(['blob-generation-failed', 'not-focused', 'permission-denied', 'unknown']);
  });
});
