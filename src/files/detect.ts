import type { DetectedType, FileFamily } from './types';

/** How many leading bytes {@link detectFileType} reads: enough for every signature and a text sniff. */
export const FILE_SNIFF_BYTES = 8192;

const type = (mime: string, family: FileFamily, extensions: readonly string[], parent: string | null = null): DetectedType =>
  Object.freeze({ mime, family, extensions: Object.freeze(extensions), parent });

const ZIP = 'application/zip';
const TEXT = 'text/plain';
const OLE = 'application/x-ole-storage';

/** The names of the types {@link FILE_TYPES} holds. */
type FileTypeName =
  | 'pdf'
  | 'png'
  | 'jpeg'
  | 'gif'
  | 'webp'
  | 'avif'
  | 'heic'
  | 'bmp'
  | 'ico'
  | 'tiff'
  | 'psd'
  | 'svg'
  | 'mp3'
  | 'wav'
  | 'flac'
  | 'ogg'
  | 'm4a'
  | 'mp4'
  | 'mov'
  | 'threegp'
  | 'webm'
  | 'mkv'
  | 'avi'
  | 'zip'
  | 'docx'
  | 'xlsx'
  | 'pptx'
  | 'odt'
  | 'ods'
  | 'odp'
  | 'epub'
  | 'jar'
  | 'apk'
  | 'ole'
  | 'rtf'
  | 'gzip'
  | 'bzip2'
  | 'xz'
  | 'zstd'
  | 'sevenZip'
  | 'rar'
  | 'tar'
  | 'sqlite'
  | 'woff'
  | 'woff2'
  | 'otf'
  | 'ttf'
  | 'exe'
  | 'elf'
  | 'macho'
  | 'wasm'
  | 'shortcut'
  | 'script'
  | 'html'
  | 'xml'
  | 'json'
  | 'text';

/** Every type this module recognises, by MIME type. */
export const FILE_TYPES: { readonly [Name in FileTypeName]: DetectedType } = {
  pdf: type('application/pdf', 'document', ['pdf']),
  png: type('image/png', 'image', ['png', 'apng']),
  jpeg: type('image/jpeg', 'image', ['jpg', 'jpeg', 'jpe', 'jfif']),
  gif: type('image/gif', 'image', ['gif']),
  webp: type('image/webp', 'image', ['webp']),
  avif: type('image/avif', 'image', ['avif']),
  heic: type('image/heic', 'image', ['heic', 'heif']),
  bmp: type('image/bmp', 'image', ['bmp', 'dib']),
  ico: type('image/x-icon', 'image', ['ico', 'cur']),
  tiff: type('image/tiff', 'image', ['tif', 'tiff', 'dng', 'cr2', 'nef', 'arw']),
  psd: type('image/vnd.adobe.photoshop', 'image', ['psd']),
  svg: type('image/svg+xml', 'image', ['svg', 'svgz'], TEXT),
  mp3: type('audio/mpeg', 'audio', ['mp3']),
  wav: type('audio/wav', 'audio', ['wav']),
  flac: type('audio/flac', 'audio', ['flac']),
  ogg: type('audio/ogg', 'audio', ['ogg', 'oga', 'ogv', 'opus', 'spx']),
  m4a: type('audio/mp4', 'audio', ['m4a', 'm4b'], 'video/mp4'),
  mp4: type('video/mp4', 'video', ['mp4', 'm4v', 'm4a', 'mov']),
  mov: type('video/quicktime', 'video', ['mov', 'qt'], 'video/mp4'),
  threegp: type('video/3gpp', 'video', ['3gp', '3g2'], 'video/mp4'),
  webm: type('video/webm', 'video', ['webm', 'weba']),
  mkv: type('video/x-matroska', 'video', ['mkv', 'mka', 'webm']),
  avi: type('video/x-msvideo', 'video', ['avi']),
  zip: type(ZIP, 'archive', ['zip']),
  docx: type('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'document', ['docx', 'docm', 'dotx', 'dotm'], ZIP),
  xlsx: type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'document', ['xlsx', 'xlsm', 'xltx', 'xltm'], ZIP),
  pptx: type('application/vnd.openxmlformats-officedocument.presentationml.presentation', 'document', ['pptx', 'pptm', 'potx', 'potm', 'ppsx', 'ppsm'], ZIP),
  odt: type('application/vnd.oasis.opendocument.text', 'document', ['odt'], ZIP),
  ods: type('application/vnd.oasis.opendocument.spreadsheet', 'document', ['ods'], ZIP),
  odp: type('application/vnd.oasis.opendocument.presentation', 'document', ['odp'], ZIP),
  epub: type('application/epub+zip', 'document', ['epub'], ZIP),
  jar: type('application/java-archive', 'executable', ['jar', 'war', 'ear'], ZIP),
  apk: type('application/vnd.android.package-archive', 'executable', ['apk', 'aab'], ZIP),
  ole: type(OLE, 'document', ['doc', 'xls', 'ppt', 'msg', 'msi', 'dot', 'xlt', 'pps']),
  rtf: type('application/rtf', 'document', ['rtf'], TEXT),
  gzip: type('application/gzip', 'archive', ['gz', 'tgz']),
  bzip2: type('application/x-bzip2', 'archive', ['bz2', 'tbz2']),
  xz: type('application/x-xz', 'archive', ['xz', 'txz']),
  zstd: type('application/zstd', 'archive', ['zst']),
  sevenZip: type('application/x-7z-compressed', 'archive', ['7z']),
  rar: type('application/vnd.rar', 'archive', ['rar']),
  tar: type('application/x-tar', 'archive', ['tar']),
  sqlite: type('application/vnd.sqlite3', 'data', ['sqlite', 'sqlite3']),
  woff: type('font/woff', 'font', ['woff']),
  woff2: type('font/woff2', 'font', ['woff2']),
  otf: type('font/otf', 'font', ['otf']),
  ttf: type('font/ttf', 'font', ['ttf', 'ttc']),
  exe: type('application/vnd.microsoft.portable-executable', 'executable', ['exe', 'dll', 'sys', 'scr', 'com', 'cpl', 'ocx', 'efi']),
  elf: type('application/x-elf', 'executable', ['so', 'run', 'elf']),
  macho: type('application/x-mach-binary', 'executable', ['dylib', 'bundle']),
  wasm: type('application/wasm', 'executable', ['wasm']),
  shortcut: type('application/x-ms-shortcut', 'executable', ['lnk']),
  script: type('text/x-shellscript', 'executable', ['sh', 'bash', 'zsh', 'command', 'py', 'pl', 'rb'], TEXT),
  html: type('text/html', 'text', ['html', 'htm', 'xhtml', 'xht', 'shtml', 'mht', 'mhtml'], TEXT),
  xml: type('application/xml', 'text', ['xml', 'xsl', 'xslt', 'rss', 'atom', 'kml', 'gpx'], TEXT),
  json: type('application/json', 'text', ['json', 'geojson', 'jsonld', 'webmanifest', 'map'], TEXT),
  text: type(TEXT, 'text', ['txt']),
};

/** Bounds-checked reads: past the end is never a match. */
class Head {
  readonly bytes: Uint8Array;
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }
  at(index: number): number {
    return index < this.bytes.length ? (this.bytes[index] as number) : -1;
  }
  is(offset: number, ...values: readonly number[]): boolean {
    return values.every((value, index) => this.at(offset + index) === value);
  }
  ascii(offset: number, length: number): string {
    let out = '';
    for (let index = offset; index < offset + length && index < this.bytes.length; index += 1) out += String.fromCharCode(this.bytes[index] as number);
    return out;
  }
  u16le(offset: number): number {
    return this.at(offset) + (this.at(offset + 1) << 8);
  }
  u32le(offset: number): number {
    return (this.at(offset) | (this.at(offset + 1) << 8) | (this.at(offset + 2) << 16) | (this.at(offset + 3) << 24)) >>> 0;
  }
}

/** ISO base media (MP4, MOV, HEIC, AVIF, 3GP): `ftyp` with its major brand. */
function isoMedia(head: Head): DetectedType | null {
  if (head.ascii(4, 4) !== 'ftyp') return null;
  const brand = head.ascii(8, 4);
  if (brand === 'avif' || brand === 'avis') return FILE_TYPES.avif;
  if (['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return FILE_TYPES.heic;
  if (brand === 'qt  ') return FILE_TYPES.mov;
  if (brand.startsWith('M4A') || brand.startsWith('M4B')) return FILE_TYPES.m4a;
  if (brand.startsWith('3g')) return FILE_TYPES.threegp;
  return FILE_TYPES.mp4;
}

/** RIFF containers: WebP, WAV, AVI. */
function riff(head: Head): DetectedType | null {
  if (head.ascii(0, 4) !== 'RIFF') return null;
  const form = head.ascii(8, 4);
  if (form === 'WEBP') return FILE_TYPES.webp;
  if (form === 'WAVE') return FILE_TYPES.wav;
  if (form === 'AVI ') return FILE_TYPES.avi;
  return null;
}

/** A ZIP, and what it packages: Office, OpenDocument, EPUB, Java and Android archives. */
function zip(head: Head): { readonly type: DetectedType; readonly macros: boolean } | null {
  if (!head.is(0, 0x50, 0x4b) || !(head.is(2, 0x03, 0x04) || head.is(2, 0x05, 0x06) || head.is(2, 0x07, 0x08))) return null;
  // OpenDocument and EPUB store their type first, uncompressed, in an entry named `mimetype`.
  if (head.ascii(30, 8) === 'mimetype') {
    const declared = head.ascii(38, head.u32le(18) > 0 && head.u32le(18) < 100 ? head.u32le(18) : 80);
    for (const candidate of [FILE_TYPES.epub, FILE_TYPES.odt, FILE_TYPES.ods, FILE_TYPES.odp]) {
      if (declared.startsWith(candidate.mime)) return { type: candidate, macros: false };
    }
  }
  // Entry names are stored as plain text in each local header: scan the head for them.
  const names = head.ascii(0, head.bytes.length);
  const macros = names.includes('vbaProject.bin');
  if (names.includes('AndroidManifest.xml') || names.includes('classes.dex')) return { type: FILE_TYPES.apk, macros };
  if (names.includes('META-INF/MANIFEST.MF')) return { type: FILE_TYPES.jar, macros };
  if (names.includes('word/')) return { type: FILE_TYPES.docx, macros };
  if (names.includes('xl/')) return { type: FILE_TYPES.xlsx, macros };
  if (names.includes('ppt/')) return { type: FILE_TYPES.pptx, macros };
  return { type: FILE_TYPES.zip, macros };
}

/** Binary formats, recognised by their signatures. */
function binary(head: Head): DetectedType | null {
  if (head.ascii(0, 5) === '%PDF-') return FILE_TYPES.pdf;
  if (head.is(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return FILE_TYPES.png;
  if (head.is(0, 0xff, 0xd8, 0xff)) return FILE_TYPES.jpeg;
  if (head.ascii(0, 6) === 'GIF87a' || head.ascii(0, 6) === 'GIF89a') return FILE_TYPES.gif;
  if (head.ascii(0, 2) === 'BM' && [12, 40, 52, 56, 64, 108, 124].includes(head.u32le(14))) return FILE_TYPES.bmp;
  if (head.is(0, 0, 0, 1, 0) || head.is(0, 0, 0, 2, 0)) {
    // ICO and CUR: a count of images, each 16 bytes, then the first image's offset past the directory.
    const count = head.u16le(4);
    if (count > 0 && count <= 256 && head.at(9) === 0) return FILE_TYPES.ico;
  }
  if (head.is(0, 0x49, 0x49, 0x2a, 0x00) || head.is(0, 0x4d, 0x4d, 0x00, 0x2a)) return FILE_TYPES.tiff;
  if (head.ascii(0, 4) === '8BPS') return FILE_TYPES.psd;
  const media = isoMedia(head) ?? riff(head);
  if (media) return media;
  if (head.ascii(0, 3) === 'ID3' || (head.at(0) === 0xff && [0xfb, 0xf3, 0xf2].includes(head.at(1)))) return FILE_TYPES.mp3;
  if (head.ascii(0, 4) === 'fLaC') return FILE_TYPES.flac;
  if (head.ascii(0, 4) === 'OggS') return FILE_TYPES.ogg;
  if (head.is(0, 0x1a, 0x45, 0xdf, 0xa3)) return head.ascii(0, 64).includes('webm') ? FILE_TYPES.webm : FILE_TYPES.mkv;
  if (head.is(0, 0x1f, 0x8b)) return FILE_TYPES.gzip;
  if (head.ascii(0, 3) === 'BZh') return FILE_TYPES.bzip2;
  if (head.is(0, 0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00)) return FILE_TYPES.xz;
  if (head.is(0, 0x28, 0xb5, 0x2f, 0xfd)) return FILE_TYPES.zstd;
  if (head.is(0, 0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)) return FILE_TYPES.sevenZip;
  if (head.is(0, 0x52, 0x61, 0x72, 0x21, 0x1a, 0x07)) return FILE_TYPES.rar;
  if (head.ascii(257, 5) === 'ustar') return FILE_TYPES.tar;
  if (head.is(0, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return FILE_TYPES.ole;
  if (head.ascii(0, 5) === '{\\rtf') return FILE_TYPES.rtf;
  if (head.ascii(0, 15) === 'SQLite format 3' && head.at(15) === 0) return FILE_TYPES.sqlite;
  if (head.ascii(0, 4) === 'wOFF') return FILE_TYPES.woff;
  if (head.ascii(0, 4) === 'wOF2') return FILE_TYPES.woff2;
  if (head.ascii(0, 4) === 'OTTO') return FILE_TYPES.otf;
  if (head.is(0, 0x00, 0x01, 0x00, 0x00, 0x00) || head.ascii(0, 4) === 'true' || head.ascii(0, 4) === 'ttcf') return FILE_TYPES.ttf;
  if (head.ascii(0, 2) === 'MZ') return FILE_TYPES.exe;
  if (head.is(0, 0x7f, 0x45, 0x4c, 0x46)) return FILE_TYPES.elf;
  if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca].includes(head.u32le(0))) return FILE_TYPES.macho;
  if (head.is(0, 0x00, 0x61, 0x73, 0x6d)) return FILE_TYPES.wasm;
  if (head.is(0, 0x4c, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00)) return FILE_TYPES.shortcut;
  return null;
}

/** UTF-8 (valid, with no NUL), or UTF-16 with its byte order mark: the bytes are text. */
function decodeText(bytes: Uint8Array, complete: boolean): string | null {
  if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) {
    return new TextDecoder(bytes[0] === 0xff ? 'utf-16le' : 'utf-16be').decode(bytes.subarray(2));
  }
  if (bytes.includes(0)) return null;
  try {
    // `stream` leaves a character cut at the end of the head undecoded, instead of an error.
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: !complete });
  } catch {
    return null;
  }
}

/** Elements that start an HTML document. Case-insensitive, though it is given lowercase text. */
const HTML_START = /^<(?:!doctype\s+html|html|head|body|script|iframe|frame|object|embed|meta|title|link|style|base|form|div|p|a|img|table)[\s/>]/i;

/** Text formats, recognised from their start. */
function textType(text: string, complete: boolean): DetectedType {
  const start = text.replace(/^\uFEFF/, '').trimStart();
  const lower = start.slice(0, 1024).toLowerCase();
  if (start.startsWith('#!')) return FILE_TYPES.script;
  if (lower.startsWith('{\\rtf')) return FILE_TYPES.rtf;
  if (lower.startsWith('<')) {
    // Past an XML declaration, comments and a doctype: the first element decides.
    const body = lower.replace(/^(?:<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!doctype\s+(?!html)[^>]*>|\s+)*/, '');
    if (body.startsWith('<svg')) return FILE_TYPES.svg;
    if (HTML_START.test(body)) return FILE_TYPES.html;
    return lower.startsWith('<?xml') || /^<[a-z_][\w.:-]*[\s/>]/.test(body) ? FILE_TYPES.xml : FILE_TYPES.text;
  }
  if (complete && (start.startsWith('{') || start.startsWith('['))) {
    try {
      JSON.parse(start);
      return FILE_TYPES.json;
    } catch {
      return FILE_TYPES.text;
    }
  }
  return FILE_TYPES.text;
}

export interface Detection {
  readonly type: DetectedType | null;
  /** A ZIP-based Office file holding a VBA project. */
  readonly macros: boolean;
  /** Runs script when a browser opens it: HTML, SVG, or XML with XHTML, a script or a stylesheet. */
  readonly active: boolean;
}

const ACTIVE_XML = /<script|<\?xml-stylesheet|xmlns(?::[\w.-]+)?\s*=\s*["']http:\/\/www\.w3\.org\/1999\/xhtml/i;

/**
 * What `bytes` (the start of a file, {@link FILE_SNIFF_BYTES} or all of it) are.
 * `complete` says whether they are the whole file, which some text formats need (JSON).
 */
export function detect(bytes: Uint8Array, complete: boolean): Detection {
  const head = new Head(bytes);
  const packaged = zip(head);
  if (packaged) return { type: packaged.type, macros: packaged.macros, active: false };
  const found = binary(head);
  if (found) return { type: found, macros: false, active: false };
  const text = bytes.length === 0 ? null : decodeText(bytes, complete);
  if (text === null) return { type: null, macros: false, active: false };
  const kind = textType(text, complete);
  const active = kind === FILE_TYPES.html || kind === FILE_TYPES.svg || (kind === FILE_TYPES.xml && ACTIVE_XML.test(text));
  return { type: kind, macros: false, active };
}

/**
 * The type of a file's content, from its leading bytes: never from its name or claimed type.
 * Reads at most {@link FILE_SNIFF_BYTES}. `null` when the content is not a recognised type.
 */
export function detectFileType(bytes: Uint8Array, options: { readonly complete?: boolean } = {}): DetectedType | null {
  return detect(bytes.subarray(0, FILE_SNIFF_BYTES), options.complete ?? bytes.length <= FILE_SNIFF_BYTES).type;
}
