import { copyFailure } from '../core/errors';

/** A decoded image, ready to be drawn. `source` is platform-specific (an `HTMLImageElement` in browsers). */
export interface DecodedImage {
  readonly source: unknown;
  readonly width: number;
  readonly height: number;
}

export interface PngTarget {
  /** Integer pixel size of the output. */
  readonly width: number;
  readonly height: number;
  /** CSS colour painted under the image, or `null` for transparency. */
  readonly background: string | null;
}

/**
 * Everything capture needs from the platform. The default uses the DOM;
 * inject your own for workers (OffscreenCanvas), native shells or tests.
 */
export interface CaptureEnvironment {
  readonly createObjectURL: (blob: Blob) => string;
  readonly revokeObjectURL: (url: string) => void;
  /** Serialises an `<svg>` element to markup. */
  readonly serializeSvg: (node: Element) => string;
  /** Decodes an image from a `blob:` or `data:` URL. */
  readonly loadImage: (url: string) => Promise<DecodedImage>;
  /** Draws the image scaled to `target` and encodes it as PNG. */
  readonly encodePng: (image: DecodedImage, target: PngTarget) => Promise<Blob>;
}

function loadImage(url: string): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      reject(copyFailure('blob-generation-failed', 'The image could not be decoded.'));
    };
    image.src = url;
  });
}

function encodePng(image: DecodedImage, target: PngTarget): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext('2d');
    if (!context) {
      reject(copyFailure('unsupported', 'Canvas 2D rendering is not available.'));
      return;
    }
    if (target.background !== null) {
      context.fillStyle = target.background;
      context.fillRect(0, 0, target.width, target.height);
    }
    context.drawImage(image.source as CanvasImageSource, 0, 0, target.width, target.height);
    // Throws SecurityError synchronously for tainted canvases; the executor turns that into a rejection.
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(copyFailure('blob-generation-failed', 'canvas.toBlob() produced nothing (canvas too large?).'));
    }, 'image/png');
  });
}

/** The DOM-backed environment, or `null` outside a browser. */
export function getDefaultCaptureEnvironment(): CaptureEnvironment | null {
  if (
    typeof document === 'undefined' ||
    typeof Image !== 'function' ||
    typeof XMLSerializer !== 'function' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return null;
  }
  return {
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => {
      URL.revokeObjectURL(url);
    },
    serializeSvg: (node) => new XMLSerializer().serializeToString(node),
    loadImage,
    encodePng,
  };
}

export function resolveCaptureEnvironment(environment: CaptureEnvironment | undefined): CaptureEnvironment {
  const resolved = environment ?? getDefaultCaptureEnvironment();
  if (!resolved) {
    throw copyFailure('unsupported', 'Image capture needs a browser environment (document, Image, canvas).');
  }
  return resolved;
}
