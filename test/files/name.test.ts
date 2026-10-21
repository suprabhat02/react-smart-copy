// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { hasDoubleExtension, hasHiddenCharacters } from '../../src/files/name';
import { EXECUTABLE_EXTENSIONS, extensionOf, safeFileName } from '../../src/files';

const bytesOf = (text: string): number => new TextEncoder().encode(text).length;

describe('extensionOf', () => {
  it.each([
    ['report.PDF', 'pdf'],
    ['archive.tar.gz', 'gz'],
    ['dir/sub\\name.txt', 'txt'],
    ['trailing.pdf. . ', 'pdf'],
    ['README', null],
    ['.env', null],
    ['name.', null],
    ['name. ', null],
    ['a. b', 'b'],
  ])('%s has %s', (name, extension) => {
    expect(extensionOf(name)).toBe(extension);
  });
});

describe('hasDoubleExtension', () => {
  it.each([
    ['invoice.pdf.exe', true],
    ['Photo.JPG.scr', true],
    ['invoice.pdf          .exe', true],
    ['invoice\u202Efdp.exe', false],
    ['setup.exe', false],
    ['notes.v2.exe', false],
    ['report.pdf', false],
    ['report.pdf.zip', false],
    ['.exe', false],
  ])('%s: %s', (name, expected) => {
    expect(hasDoubleExtension(name)).toBe(expected);
  });
});

describe('hasHiddenCharacters', () => {
  it.each(['a\u202Eb', 'a\u200Bb', 'a\u0000b', 'tab\tname', 'a\u{E0041}b', 'a\uFEFFb', 'a\u2066b'])('finds them in %j', (name) => {
    expect(hasHiddenCharacters(name)).toBe(true);
  });
  it('accepts ordinary names in any script', () => {
    for (const name of ['report.pdf', 'R\u00E9sum\u00E9.docx', '\u5831\u544A\u66F8.xlsx', '\u041E\u0442\u0447\u0451\u0442.pdf', 'emoji \u{1F389}.png']) expect(hasHiddenCharacters(name)).toBe(false);
  });
});

describe('safeFileName', () => {
  it.each([
    ['../../etc/passwd', 'passwd'],
    ['C:\\Users\\me\\report.pdf', 'report.pdf'],
    ['invoice\u202Egpj.exe', 'invoicegpj.exe'],
    ['a<b>:c"d|e?f*.txt', 'a_b__c_d_e_f_.txt'],
    ['  ..hidden file  .txt. . ', 'hidden file .txt'],
    ['many    spaces\t\nhere.md', 'many spaces here.md'],
    ['CON', '_CON'],
    ['nul.txt', '_nul.txt'],
    ['com1.tar.gz', '_com1.tar.gz'],
    ['LPT\u00B9.log', '_LPT\u00B9.log'],
    ['console.log', 'console.log'],
    ['e\u0301t\u00E9.txt', '\u00E9t\u00E9.txt'],
    ['', 'file'],
    ['...', 'file'],
    ['\u202E', 'file'],
    ['/', 'file'],
  ])('%j becomes %j', (name, safe) => {
    expect(safeFileName(name)).toBe(safe);
  });

  it('takes a replacement and a fallback, refusing unsafe replacements', () => {
    expect(safeFileName('a:b', { replacement: '-' })).toBe('a-b');
    expect(safeFileName('a:b', { replacement: '' })).toBe('ab');
    expect(safeFileName('con', { replacement: '' })).toBe('_con');
    expect(safeFileName('a:b', { replacement: '/' })).toBe('a_b');
    expect(safeFileName('a:b', { replacement: 'toolong' })).toBe('a_b');
    expect(safeFileName('a:b', { replacement: '\u202E' })).toBe('a_b');
    expect(safeFileName('', { fallback: 'untitled' })).toBe('untitled');
  });

  it('fits maxBytes in UTF-8, keeping the extension and whole characters', () => {
    const long = `${'\u00E9'.repeat(200)}.pdf`;
    const safe = safeFileName(long);
    expect(bytesOf(safe)).toBeLessThanOrEqual(255);
    expect(safe.endsWith('.pdf')).toBe(true);
    expect(safe).toMatch(/^\u00E9+\.pdf$/u);
    expect(safeFileName(`${'a'.repeat(40)}.verylongextensionname`, { maxBytes: 20 })).toBe('a'.repeat(20));
    expect(bytesOf(safeFileName('x'.repeat(100), { maxBytes: 1 }))).toBe(16);
    // An extension too long to leave room for a name is cut with the rest.
    expect(safeFileName(`${'\u00E9'.repeat(10)}.abcdefghijklmnop`, { maxBytes: 17 })).toBe('\u00E9'.repeat(8));
    expect(safeFileName('\u{1F600}'.repeat(5) + '.pdf', { maxBytes: 16 })).toBe(`${'\u{1F600}'.repeat(3)}.pdf`);
    expect(safeFileName(`${'a'.repeat(30)} .pdf`, { maxBytes: 20 })).toBe(`${'a'.repeat(16)}.pdf`);
  });

  it('is idempotent', () => {
    for (const name of ['../a:b.txt', ' . CON . ', 'x'.repeat(400), 'invoice\u202Egpj.exe']) {
      const once = safeFileName(name);
      expect(safeFileName(once)).toBe(once);
    }
  });

  it('knows what the operating system runs', () => {
    for (const extension of ['exe', 'bat', 'ps1', 'js', 'jar', 'iso', 'lnk', 'scr', 'msi', 'command']) expect(EXECUTABLE_EXTENSIONS.has(extension)).toBe(true);
    for (const extension of ['pdf', 'png', 'txt', 'docx']) expect(EXECUTABLE_EXTENSIONS.has(extension)).toBe(false);
  });
});
