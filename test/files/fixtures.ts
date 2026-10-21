/** Byte fixtures for the files module: the smallest headers that identify each format. */

export const bytes = (...parts: readonly (string | readonly number[] | Uint8Array)[]): Uint8Array => {
  const chunks = parts.map((part) => (typeof part === 'string' ? Uint8Array.from(part, (char) => char.charCodeAt(0)) : Uint8Array.from(part)));
  const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
};

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

const zeros = (count: number): number[] => Array.from({ length: count }, () => 0);

/** A ZIP local file header for `name`, then `data` stored uncompressed. */
export const zipEntry = (name: string, data = ''): Uint8Array =>
  bytes(
    'PK',
    [3, 4, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0],
    [data.length & 0xff, data.length >> 8, 0, 0],
    [data.length & 0xff, data.length >> 8, 0, 0],
    [name.length, 0, 0, 0],
    name,
    data,
  );

/** ISO media with a major brand. */
export const ftyp = (brand: string): Uint8Array => bytes([0, 0, 0, 24], 'ftyp', brand, [0, 0, 0, 0]);

export const riff = (form: string): Uint8Array => bytes('RIFF', [0, 0, 0, 0], form);

/** One file per signature in FILE_TYPES (by key), each the minimal header. */
export const SAMPLES: Readonly<Record<string, Uint8Array>> = {
  pdf: bytes('%PDF-1.7\n'),
  png: bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpeg: bytes([0xff, 0xd8, 0xff, 0xe0]),
  gif: bytes('GIF89a'),
  webp: riff('WEBP'),
  avif: ftyp('avif'),
  heic: ftyp('heic'),
  bmp: bytes('BM', zeros(12), [40, 0, 0, 0]),
  ico: bytes([0, 0, 1, 0, 1, 0, 16, 16, 0, 0]),
  tiff: bytes('II*', [0]),
  psd: bytes('8BPS'),
  mp3: bytes('ID3', [4, 0]),
  wav: riff('WAVE'),
  flac: bytes('fLaC'),
  ogg: bytes('OggS'),
  m4a: ftyp('M4A '),
  mp4: ftyp('isom'),
  mov: ftyp('qt  '),
  threegp: ftyp('3gp5'),
  webm: bytes([0x1a, 0x45, 0xdf, 0xa3], 'B\u0082\u0084webm'),
  mkv: bytes([0x1a, 0x45, 0xdf, 0xa3], 'B\u0082\u0088matroska'),
  avi: riff('AVI '),
  zip: zipEntry('notes.txt', 'hi'),
  docx: bytes(zipEntry('[Content_Types].xml'), zipEntry('word/document.xml')),
  xlsx: bytes(zipEntry('[Content_Types].xml'), zipEntry('xl/workbook.xml')),
  pptx: bytes(zipEntry('[Content_Types].xml'), zipEntry('ppt/presentation.xml')),
  odt: zipEntry('mimetype', 'application/vnd.oasis.opendocument.text'),
  ods: zipEntry('mimetype', 'application/vnd.oasis.opendocument.spreadsheet'),
  odp: zipEntry('mimetype', 'application/vnd.oasis.opendocument.presentation'),
  epub: zipEntry('mimetype', 'application/epub+zip'),
  jar: zipEntry('META-INF/MANIFEST.MF', 'Manifest-Version: 1.0'),
  apk: zipEntry('AndroidManifest.xml'),
  ole: bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  rtf: bytes('{\\rtf1\\ansi hello}'),
  gzip: bytes([0x1f, 0x8b, 8]),
  bzip2: bytes('BZh9'),
  xz: bytes([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]),
  zstd: bytes([0x28, 0xb5, 0x2f, 0xfd]),
  sevenZip: bytes([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]),
  rar: bytes('Rar!', [0x1a, 0x07, 0x01, 0x00]),
  tar: bytes(zeros(257), 'ustar', [0]),
  sqlite: bytes('SQLite format 3', [0]),
  woff: bytes('wOFF'),
  woff2: bytes('wOF2'),
  otf: bytes('OTTO'),
  ttf: bytes([0, 1, 0, 0, 0, 12]),
  exe: bytes('MZ', [0x90, 0]),
  elf: bytes([0x7f], 'ELF', [2, 1]),
  macho: bytes([0xcf, 0xfa, 0xed, 0xfe]),
  wasm: bytes([0], 'asm', [1, 0, 0, 0]),
  shortcut: bytes([0x4c, 0, 0, 0, 0x01, 0x14, 0x02, 0x00]),
  script: utf8('#!/bin/sh\necho hi\n'),
  html: utf8('<!DOCTYPE html><html><body>hi</body></html>'),
  xml: utf8('<?xml version="1.0"?><note><to>you</to></note>'),
  json: utf8('{"a": [1, 2]}'),
  svg: utf8('<?xml version="1.0"?>\n<!-- logo -->\n<svg xmlns="http://www.w3.org/2000/svg"/>'),
  text: utf8('Plain words.\n'),
};
