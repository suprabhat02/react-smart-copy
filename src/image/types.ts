import type { TiffSummary } from './exif';

/** Formats recognised from their bytes (never from a file name or a claimed MIME type). */
export type ImageFormat = 'jpeg' | 'png' | 'gif' | 'webp' | 'avif' | 'heic' | 'bmp';

/**
 * Kinds of metadata an image can carry.
 *
 * - `exif`: camera, settings, dates, serial numbers (Exif / TIFF tags).
 * - `gps`: a location, inside Exif.
 * - `thumbnail`: an embedded preview, which can show the uncropped original.
 * - `xmp`: Adobe XMP (edit history, authors, often a copy of Exif).
 * - `iptc`: captions, credits and keywords (Photoshop IRB / IPTC).
 * - `comment`: free-text comments (JPEG COM, GIF comment extension).
 * - `text`: text chunks (PNG `tEXt`, `zTXt`, `iTXt`, `tIME`).
 * - `icc`: an ICC colour profile. Kept by default: it changes how colours look.
 * - `other`: anything else outside the image data: vendor segments, multi-picture
 *   (MPF) and depth images, content credentials (C2PA), data appended after the
 *   image (motion photos), unknown chunks.
 */
export type MetadataKind = 'exif' | 'gps' | 'thumbnail' | 'xmp' | 'iptc' | 'comment' | 'text' | 'icc' | 'other';

/** Every metadata kind, in a stable order. */
export const METADATA_KINDS: readonly MetadataKind[] = Object.freeze(['exif', 'gps', 'thumbnail', 'xmp', 'iptc', 'comment', 'text', 'icc', 'other']);

export interface ImageInfo {
  /** `null` when the bytes are not a format this module reads. */
  readonly format: ImageFormat | null;
  /** e.g. `image/jpeg`; `null` when `format` is. */
  readonly mimeType: string | null;
  /** Stored pixel size (before orientation), when the header gives it. */
  readonly width: number | null;
  readonly height: number | null;
  /** Exif orientation, 1-8 (1 = as stored). Browsers apply it when they draw the image. */
  readonly orientation: number;
  /** Several frames: an animated GIF, PNG (APNG), WebP or AVIF. */
  readonly animated: boolean;
  /** What the file carries besides the image itself, in the order of {@link METADATA_KINDS}. */
  readonly metadata: readonly MetadataKind[];
}

export const MIME_TYPES: Readonly<Record<ImageFormat, string>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  bmp: 'image/bmp',
};

/** Collects findings while a parser walks a file. */
export class Found {
  /** An Exif block holding only the orientation (what stripping leaves). */
  orientationOnly = false;
  readonly kinds = new Set<MetadataKind>();
  width: number | null = null;
  height: number | null = null;
  orientation = 1;
  animated = false;

  add(kind: MetadataKind): void {
    this.kinds.add(kind);
  }

  /** Records an Exif block: `null` when it could not be read (still Exif). */
  exif(summary: TiffSummary | null): void {
    if (summary === null || !summary.onlyOrientation) this.add('exif');
    if (summary === null) return;
    if (summary.onlyOrientation) this.orientationOnly = true;
    this.orientation = summary.orientation;
    if (summary.gps) this.add('gps');
    if (summary.thumbnail) this.add('thumbnail');
  }

  info(format: ImageFormat | null): ImageInfo {
    return {
      format,
      mimeType: format === null ? null : MIME_TYPES[format],
      width: this.width,
      height: this.height,
      orientation: this.orientation,
      animated: this.animated,
      metadata: METADATA_KINDS.filter((kind) => this.kinds.has(kind)),
    };
  }
}

export interface StripSettings {
  /** Keep the ICC colour profile. */
  readonly colorProfile: boolean;
  /** Keep Exif orientation (as a minimal Exif block) so the image displays the right way up. */
  readonly orientation: boolean;
}

/** A parsed file: what it holds, and how to write it without its metadata (`null` when the format can't be stripped losslessly). */
export interface Parsed {
  readonly info: ImageInfo;
  /** Its only Exif is an orientation-only block (not reported as metadata). */
  readonly orientationOnly?: boolean;
  readonly strip: ((settings: StripSettings) => { readonly parts: readonly Uint8Array[]; readonly removed: ReadonlySet<MetadataKind> }) | null;
}
