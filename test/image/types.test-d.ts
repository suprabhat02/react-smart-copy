import { describe, expectTypeOf, it } from 'vitest';
import {
  prepareImage,
  readImageInfo,
  stripMetadata,
  type ImageInfo,
  type MetadataKind,
  type PreparedImage,
  type StrippedImage,
} from '../../src/image';

describe('image types', () => {
  it('takes Blobs and Files and returns typed results', () => {
    expectTypeOf(readImageInfo(new Blob())).toEqualTypeOf<Promise<ImageInfo>>();
    expectTypeOf(stripMetadata(new File([], 'a.jpg'), { keepOrientation: false })).toEqualTypeOf<Promise<StrippedImage>>();
    expectTypeOf(prepareImage(new Blob(), { maxWidth: 2048, maxBytes: 1_000_000, type: 'image/webp', animated: 'first-frame' })).toEqualTypeOf<Promise<PreparedImage>>();
    expectTypeOf<ImageInfo['metadata'][number]>().toEqualTypeOf<MetadataKind>();
    // @ts-expect-error: not an output type
    void prepareImage(new Blob(), { type: 'image/gif' });
    // @ts-expect-error: not an animation policy
    void prepareImage(new Blob(), { animated: 'loop' });
    // @ts-expect-error: not a Blob
    void readImageInfo('photo.jpg');
  });
});
