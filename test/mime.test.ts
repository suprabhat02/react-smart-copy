import { describe, expect, it } from 'vitest';
import {
  isTextualMimeType,
  matchesMimePattern,
  normalizeMimeType,
  sniffImageBytes,
  sniffImageType,
} from '../src/core/mime';
import { jpegBlob, pngBlob } from './fixtures';

const bytes = (...values: Array<number | string>): Uint8Array =>
  new Uint8Array(values.flatMap((value) => (typeof value === 'string' ? Array.from(value, (c) => c.charCodeAt(0)) : [value])));

describe('normalizeMimeType', () => {
  it('lower-cases, trims and strips parameters', () => {
    expect(normalizeMimeType(' Text/Plain ; charset=UTF-8')).toBe('text/plain');
    expect(normalizeMimeType('image/svg+xml')).toBe('image/svg+xml');
  });

  it.each(['', 'Files', 'text', 'text/', '/plain', 'text/plain/extra', 'te xt/plain', '<script>/x', `a/${'b'.repeat(200)}`])(
    'rejects %j',
    (value) => {
      expect(normalizeMimeType(value)).toBeNull();
    },
  );
});

describe('matchesMimePattern', () => {
  it('matches exact types and wildcards', () => {
    expect(matchesMimePattern('text/plain', 'text/plain')).toBe(true);
    expect(matchesMimePattern('image/png', 'image/*')).toBe(true);
    expect(matchesMimePattern('application/pdf', '*/*')).toBe(true);
    expect(matchesMimePattern('text/html', 'text/plain')).toBe(false);
    expect(matchesMimePattern('text/plain', 'image/*')).toBe(false);
  });

  it('never matches SVG through a wildcard, only exactly', () => {
    expect(matchesMimePattern('image/svg+xml', 'image/*')).toBe(false);
    expect(matchesMimePattern('image/svg+xml', '*/*')).toBe(false);
    expect(matchesMimePattern('image/svg+xml', 'image/svg+xml')).toBe(true);
  });
});

describe('isTextualMimeType', () => {
  it.each([
    ['text/plain', true],
    ['text/html', true],
    ['image/svg+xml', true],
    ['application/json', true],
    ['application/xml', true],
    ['image/png', false],
    ['application/pdf', false],
  ])('%s → %s', (type, expected) => {
    expect(isTextualMimeType(type)).toBe(expected);
  });
});

describe('sniffImageBytes', () => {
  it.each([
    ['image/png', bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a)],
    ['image/jpeg', bytes(0xff, 0xd8, 0xff, 0xdb)],
    ['image/gif', bytes('GIF89a')],
    ['image/webp', bytes('RIFF', 0, 0, 0, 0, 'WEBP')],
    ['image/avif', bytes(0, 0, 0, 0x1c, 'ftypavif')],
    ['image/avif', bytes(0, 0, 0, 0x1c, 'ftypavis')],
    ['image/bmp', bytes('BM', 0, 0)],
  ])('recognises %s', (expected, input) => {
    expect(sniffImageBytes(input)).toBe(expected);
  });

  it('rejects everything else, including RIFF that is not WebP', () => {
    expect(sniffImageBytes(bytes('<svg xmlns'))).toBeNull();
    expect(sniffImageBytes(bytes('RIFF', 0, 0, 0, 0, 'WAVE'))).toBeNull();
    expect(sniffImageBytes(new Uint8Array())).toBeNull();
  });
});

describe('sniffImageType', () => {
  it('trusts bytes, not the claimed type', async () => {
    expect(await sniffImageType(pngBlob(1, 1, 'text/plain'))).toBe('image/png');
    expect(await sniffImageType(jpegBlob('image/png'))).toBe('image/jpeg');
    expect(await sniffImageType(new Blob(['not an image'], { type: 'image/png' }))).toBeNull();
  });
});
