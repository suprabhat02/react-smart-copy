import type { CaptureEnvironment } from '../src/capture/environment';
import { isCopyFailure } from '../src/core/errors';
import type { ClipboardItemLike, DataTransferLike } from '../src/core/paste-reader';

/** Bytes of a minimal PNG header (signature + IHDR) declaring `width` × `height`. */
export function pngBytes(width = 1, height = 1): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

export const pngBlob = (width = 1, height = 1, type = 'image/png'): Blob => new Blob([pngBytes(width, height)], { type });
export const jpegBlob = (type = 'image/jpeg'): Blob => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])], { type });
export const pngFile = (name = 'shot.png', type = 'image/png'): File => new File([pngBytes()], name, { type });

/** A `DataTransfer` stand-in (jsdom has none). */
export function fakeDataTransfer(data: Record<string, string>, files: readonly File[] = []): DataTransferLike {
  const types = Object.keys(data);
  if (files.length > 0) types.push('Files');
  return {
    types,
    getData: (format) => data[format] ?? '',
    files,
  };
}

/** A `ClipboardItem` stand-in. `failing` types reject in `getType()`. */
export function fakeClipboardItem(entries: Record<string, Blob | string>, failing: readonly string[] = []): ClipboardItemLike {
  const types = [...Object.keys(entries), ...failing];
  return {
    types,
    getType: (type) => {
      const entry = entries[type];
      if (entry === undefined) return Promise.reject(new Error(`No ${type}`));
      return Promise.resolve(typeof entry === 'string' ? new Blob([entry], { type }) : entry);
    },
  };
}

/** A paste-event stand-in that records `preventDefault()`. */
export function fakePasteEvent(clipboardData: DataTransferLike | null) {
  let prevented = false;
  return {
    clipboardData,
    preventDefault: () => {
      prevented = true;
    },
    get prevented() {
      return prevented;
    },
  };
}

/** The classified failure type a promise rejects with, `'resolved'` or `'not-a-copy-failure'`. */
export const failureType = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    return isCopyFailure(error) ? error.copyError.type : 'not-a-copy-failure';
  }
  return 'resolved';
};

/** A capture environment that records what it encodes and revokes. */
export function fakeEnvironment(overrides: Partial<CaptureEnvironment> = {}) {
  let next = 0;
  const revoked: string[] = [];
  const encoded: Array<{ width: number; height: number; background: string | null }> = [];
  const environment: CaptureEnvironment = {
    createObjectURL: () => `blob:fake/${String(next++)}`,
    revokeObjectURL: (url) => {
      revoked.push(url);
    },
    serializeSvg: (node) => node.outerHTML,
    loadImage: () => Promise.resolve({ source: 'decoded', width: 100, height: 50 }),
    encodePng: (_image, target) => {
      encoded.push(target);
      return Promise.resolve(pngBlob(target.width, target.height));
    },
    ...overrides,
  };
  return { environment, revoked, encoded };
}
