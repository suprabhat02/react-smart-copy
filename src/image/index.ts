/**
 * `react-smart-copy/image`
 *
 * Make pasted and dropped images safe and small before they are uploaded.
 * Framework-agnostic and free of dependencies: use it with `usePaste`,
 * `PasteField` and `dropTargetProps` (their `imageFiles`), or on its own.
 *
 * - {@link readImageInfo}: format, size, orientation, animation and the metadata
 *   a file carries (GPS location, camera, thumbnails, ...), read from its bytes.
 * - {@link stripMetadata}: removes that metadata from JPEG, PNG, WebP and GIF
 *   without re-encoding: the picture stays bit-for-bit the same. Server-safe.
 * - {@link prepareImage}: strips, resizes and compresses under a byte budget in
 *   the browser, re-encoding only when it has to, with limits checked before decoding.
 *
 * @module
 */

export { DEFAULT_IMAGE_MAX_INPUT_BYTES } from './bytes';
export { readImageInfo, stripMetadata, type ReadImageInfoOptions, type StripMetadataOptions, type StrippedImage } from './info';
export {
  DEFAULT_IMAGE_MAX_INPUT_PIXELS,
  DEFAULT_IMAGE_MAX_PIXELS,
  DEFAULT_IMAGE_MIN_QUALITY,
  DEFAULT_IMAGE_QUALITY,
  DEFAULT_IMAGE_TIMEOUT_MS,
  getDefaultImageEnvironment,
  prepareImage,
  type DecodedImage,
  type EncodeTarget,
  type ImageEnvironment,
  type OutputImageType,
  type PrepareImageOptions,
  type PreparedImage,
} from './prepare';
export { METADATA_KINDS, type ImageFormat, type ImageInfo, type MetadataKind } from './types';
