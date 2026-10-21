// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { detect } from '../../src/files/detect';
import { detectFileType, FILE_SNIFF_BYTES, FILE_TYPES } from '../../src/files';
import { bytes, ftyp, riff, SAMPLES, utf8, zipEntry } from './fixtures';

describe('detectFileType', () => {
  it.each(Object.keys(FILE_TYPES))('recognises %s from its bytes', (key) => {
    const sample = SAMPLES[key];
    expect(sample, `a sample for ${key}`).toBeDefined();
    expect(detectFileType(sample as Uint8Array)).toBe(FILE_TYPES[key as keyof typeof FILE_TYPES]);
  });

  it('describes every type completely, frozen', () => {
    for (const type of Object.values(FILE_TYPES)) {
      expect(type.mime).toMatch(/^[a-z]+\/[\w.+-]+$/);
      expect(type.extensions.length).toBeGreaterThan(0);
      expect(Object.isFrozen(type)).toBe(true);
      expect(Object.isFrozen(type.extensions)).toBe(true);
    }
  });

  it('returns null for empty or unrecognised binary content', () => {
    expect(detectFileType(new Uint8Array())).toBeNull();
    expect(detectFileType(bytes([0, 1, 2, 3, 0, 255]))).toBeNull();
    // Invalid UTF-8, no NUL: not text either.
    expect(detectFileType(bytes([0xc3, 0x28, 0x41]))).toBeNull();
  });

  it('needs the rest of a signature, never reading past the end', () => {
    expect(detectFileType(bytes([0x89, 0x50, 0x4e]))).toBeNull();
    expect(detectFileType(bytes('PK'))).toBe(FILE_TYPES.text);
    expect(detectFileType(bytes('RIFF', [0, 0, 0, 0], 'XXXX'))).toBeNull();
    expect(detectFileType(bytes('BM', [0, 0, 0, 0]))).toBeNull();
    expect(detectFileType(bytes('BMP is a format'))).toBe(FILE_TYPES.text);
    expect(detectFileType(bytes([0, 0, 1, 0, 0, 0]))).toBeNull();
    expect(detectFileType(bytes([0, 0, 1, 0, 1, 0, 16, 16, 0, 1]))).toBeNull();
    expect(detectFileType(bytes([0, 0, 2, 0, 1, 0, 32, 32, 0, 0]))).toBe(FILE_TYPES.ico);
    expect(detectFileType(bytes([0xff, 0xf3, 0x90]))).toBe(FILE_TYPES.mp3);
  });

  it('tells ISO media apart by brand', () => {
    expect(detectFileType(ftyp('avis'))).toBe(FILE_TYPES.avif);
    expect(detectFileType(ftyp('mif1'))).toBe(FILE_TYPES.heic);
    expect(detectFileType(ftyp('M4B '))).toBe(FILE_TYPES.m4a);
    expect(detectFileType(ftyp('mp42'))).toBe(FILE_TYPES.mp4);
    expect(detectFileType(riff('WAVE'))).toBe(FILE_TYPES.wav);
  });

  it('tells packaged formats apart, and finds VBA macros', () => {
    expect(detect(bytes(zipEntry('[Content_Types].xml'), zipEntry('word/document.xml'), zipEntry('word/vbaProject.bin')), true)).toEqual({
      type: FILE_TYPES.docx,
      macros: true,
      active: false,
    });
    expect(detect(SAMPLES['docx'] as Uint8Array, true).macros).toBe(false);
    expect(detectFileType(zipEntry('classes.dex'))).toBe(FILE_TYPES.apk);
    expect(detectFileType(bytes('PK', [5, 6], new Array<number>(18).fill(0)))).toBe(FILE_TYPES.zip);
    expect(detectFileType(bytes('PK', [7, 8], zipEntry('a').subarray(4)))).toBe(FILE_TYPES.zip);
    // A `mimetype` entry naming something else, or with an implausible size, is a plain ZIP.
    expect(detectFileType(zipEntry('mimetype', 'application/x-unknown'))).toBe(FILE_TYPES.zip);
    const huge = zipEntry('mimetype', 'application/epub+zip');
    huge.set([0, 1, 0, 0], 18);
    expect(detectFileType(huge)).toBe(FILE_TYPES.epub);
  });

  it('reads text formats from their start', () => {
    expect(detectFileType(utf8('\uFEFF  <html lang="en">'))).toBe(FILE_TYPES.html);
    expect(detectFileType(utf8('<p>Hello</p>'))).toBe(FILE_TYPES.html);
    expect(detectFileType(utf8('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN"><svg></svg>'))).toBe(FILE_TYPES.svg);
    expect(detectFileType(utf8('<note>hi</note>'))).toBe(FILE_TYPES.xml);
    expect(detectFileType(utf8('< not a tag'))).toBe(FILE_TYPES.text);
    expect(detectFileType(utf8('[1, 2'))).toBe(FILE_TYPES.text);
    expect(detectFileType(utf8('{\\rtf1 hi}'))).toBe(FILE_TYPES.rtf);
    expect(detectFileType(utf8('\n {\\rtf1 hi}'))).toBe(FILE_TYPES.rtf);
    expect(detectFileType(utf8('  #!/usr/bin/env node'))).toBe(FILE_TYPES.script);
  });

  it('reads JSON only from a whole file', () => {
    const json = utf8(`[${'1,'.repeat(FILE_SNIFF_BYTES)}1]`);
    expect(detectFileType(json)).toBe(FILE_TYPES.text);
    expect(detectFileType(utf8('{"a":1}'), { complete: false })).toBe(FILE_TYPES.text);
  });

  it('reads UTF-16 with a byte order mark, and a character cut at the end of the head', () => {
    const le = bytes([0xff, 0xfe], ...Array.from('<svg/>', (char) => [char.charCodeAt(0), 0]));
    const be = bytes([0xfe, 0xff], ...Array.from('hello', (char) => [0, char.charCodeAt(0)]));
    expect(detectFileType(le)).toBe(FILE_TYPES.svg);
    expect(detectFileType(be)).toBe(FILE_TYPES.text);
    const cut = bytes(utf8('a'.repeat(FILE_SNIFF_BYTES - 1)), [0xc3, 0xa9]);
    expect(detectFileType(cut)).toBe(FILE_TYPES.text);
    expect(detectFileType(bytes(utf8('abc'), [0xc3]))).toBeNull();
  });

  it('marks HTML, SVG and active XML as active', () => {
    expect(detect(SAMPLES['html'] as Uint8Array, true).active).toBe(true);
    expect(detect(SAMPLES['svg'] as Uint8Array, true).active).toBe(true);
    expect(detect(SAMPLES['xml'] as Uint8Array, true).active).toBe(false);
    expect(detect(utf8('<root xmlns:h="http://www.w3.org/1999/xhtml"><h:p/></root>'), true).active).toBe(true);
    expect(detect(utf8('<?xml-stylesheet href="x.xsl"?><root/>'), true)).toEqual({ type: FILE_TYPES.xml, macros: false, active: true });
    expect(detect(new Uint8Array(), true)).toEqual({ type: null, macros: false, active: false });
  });
});
