// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { prepareImage, readImageInfo, stripMetadata } from '../../src/image';
import { jpeg, segment, tiff } from './fixtures';

const photo = new Blob([jpeg({ exif: tiff({ orientation: 6, gps: true }), extra: [segment(0xfe, 'x')] }) as BlobPart]);

describe('react-smart-copy/image on the server', () => {
  it('has no DOM to rely on here', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof createImageBitmap).toBe('undefined');
  });

  it('reads and strips metadata anywhere', async () => {
    expect((await readImageInfo(photo)).metadata).toEqual(['exif', 'gps', 'comment']);
    const { blob, removed } = await stripMetadata(photo);
    expect(removed).toEqual(['exif', 'gps', 'comment']);
    expect((await readImageInfo(blob)).metadata).toEqual([]);
  });

  it('prepares without re-encoding, and says re-encoding needs a browser', async () => {
    expect(await prepareImage(photo)).toMatchObject({ reencoded: false, removed: ['exif', 'gps', 'comment'] });
    await expect(prepareImage(photo, { maxWidth: 10 })).rejects.toEqual(expect.objectContaining({ copyError: expect.objectContaining({ type: 'unsupported' }) }));
  });
});
