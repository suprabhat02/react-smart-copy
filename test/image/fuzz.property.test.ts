import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { readImageInfo, stripMetadata } from '../../src/image';
import { CopyFailure } from '../../src/core';
import { COMMENT, FRAME, GCE, VP8, appExtension, bytes, chunk, gif, jpeg, png, riff, segment, tiff, vp8x, webp } from './fixtures';

// PROPERTY_RUNS raises the count for a local stress run; CI uses the default.
const RUNS = { numRuns: Number(process.env['PROPERTY_RUNS'] ?? 1000) };

const SEEDS = [
  jpeg({ jfifThumbnail: true, exif: tiff({ orientation: 6, gps: true, thumbnail: true }), extra: [segment(0xfe, 'c'), segment(0xe2, bytes('ICC_PROFILE\0', [1, 1]))], trailing: bytes('tail') }),
  png(chunk('eXIf', tiff({ orientation: 8, gps: true })), chunk('tEXt', 'a\0b'), chunk('iCCP', 'p\0\0x')),
  webp(vp8x(0x2c), riff('ICCP', 'icc'), VP8, riff('EXIF', tiff({ orientation: 6, gps: true })), riff('XMP ', '<x/>')),
  gif(appExtension('NETSCAPE2.0'), COMMENT, GCE, FRAME, GCE, FRAME),
];

const blob = (data: Uint8Array) => new Blob([data as BlobPart]);

/** A seed with some bytes overwritten, removed or cut off. */
const mutated = fc
  .tuple(fc.constantFrom(...SEEDS), fc.array(fc.tuple(fc.nat(), fc.integer({ min: 0, max: 255 })), { maxLength: 8 }), fc.nat(), fc.boolean())
  .map(([seed, edits, cut, truncate]) => {
    const out = new Uint8Array(seed);
    for (const [at, value] of edits) out[at % out.length] = value;
    return truncate ? out.subarray(0, cut % (out.length + 1)) : out;
  });

const anyBytes = fc.oneof(mutated, fc.uint8Array({ maxLength: 300 }), fc.constantFrom(...SEEDS).chain((seed) => fc.uint8Array({ maxLength: 64 }).map((tail) => bytes(seed.subarray(0, 16), tail))));

describe('image parsing on hostile input (regressions)', () => {
  it('an empty APP2 segment never borrows the bytes after it (found by this fuzz test)', async () => {
    // APP2 with length 2 (no data), followed by bytes that read like an ICC profile identifier.
    const data = bytes([0xff, 0xd8], segment(0xfe, 'c'), [0xff, 0xe2, 0, 2], 'ICC_PROFILE\0', [1, 1], [0xff, 0xd9]);
    const first = await stripMetadata(blob(data));
    expect((await readImageInfo(first.blob)).metadata.filter((kind) => kind !== 'icc')).toEqual([]);
    const again = await stripMetadata(first.blob);
    expect(again.removed).toEqual([]);
  });
});

describe('image parsing on hostile input (properties)', () => {
  it('never throws, never hangs, and reports sane values for any bytes', async () => {
    await fc.assert(
      fc.asyncProperty(anyBytes, async (data) => {
        const info = await readImageInfo(blob(data));
        expect(info.orientation).toBeGreaterThanOrEqual(1);
        expect(info.orientation).toBeLessThanOrEqual(8);
        expect(new Set(info.metadata).size).toBe(info.metadata.length);
      }),
      RUNS,
    );
  });

  it('stripping either works or fails with a typed error; the result is clean and stripping it again changes nothing', async () => {
    await fc.assert(
      fc.asyncProperty(anyBytes, async (data) => {
        let result;
        try {
          result = await stripMetadata(blob(data));
        } catch (error) {
          expect(error).toBeInstanceOf(CopyFailure);
          return;
        }
        const after = await readImageInfo(result.blob);
        expect(after.metadata.filter((kind) => kind !== 'icc')).toEqual([]);
        expect(result.blob.size).toBeLessThanOrEqual(data.length + 64);
        const again = await stripMetadata(result.blob);
        expect(again.removed).toEqual([]);
        expect(again.blob).toBe(result.blob);
      }),
      RUNS,
    );
  });
});
