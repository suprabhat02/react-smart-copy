import { describe, expect, it, vi } from 'vitest';
import { contradicts, inspectBytes } from '../../src/files/inspect';
import { FILE_TYPES, inspectFile, matchesAccept, parseAccept } from '../../src/files';
import { bytes, SAMPLES, utf8, zipEntry } from './fixtures';

const file = (data: Uint8Array, name: string, type = ''): File => new File([data as BlobPart], name, { type });
const sample = (key: string): Uint8Array => SAMPLES[key] as Uint8Array;

describe('contradicts', () => {
  it.each([
    [null, FILE_TYPES.pdf, false],
    ['dwg', null, false],
    ['dwg', FILE_TYPES.pdf, false],
    ['pdf', FILE_TYPES.pdf, false],
    ['pdf', null, true],
    ['pdf', FILE_TYPES.html, true],
    ['jpg', FILE_TYPES.png, true],
    ['docx', FILE_TYPES.zip, false],
    ['zip', FILE_TYPES.docx, false],
    ['xlsx', FILE_TYPES.docx, true],
    ['m4a', FILE_TYPES.mp4, false],
    ['mov', FILE_TYPES.mp4, false],
    ['csv', FILE_TYPES.text, false],
    ['csv', FILE_TYPES.json, false],
    ['csv', FILE_TYPES.html, true],
    ['txt', FILE_TYPES.script, true],
    ['py', FILE_TYPES.text, false],
    ['py', FILE_TYPES.script, false],
    ['json', FILE_TYPES.text, false],
    ['html', FILE_TYPES.text, false],
    ['svg', FILE_TYPES.xml, false],
    ['txt', null, true],
    ['exe', FILE_TYPES.text, true],
  ] as const)('.%s holding %s: %s', (extension, detected, expected) => {
    expect(contradicts(extension, detected)).toBe(expected);
  });
});

describe('inspectFile', () => {
  it('reads the type from the content, never from the claim', async () => {
    const inspection = await inspectFile(file(sample('html'), 'invoice.pdf', 'application/pdf'));
    expect(inspection).toEqual({
      name: 'invoice.pdf',
      safeName: 'invoice.pdf',
      extension: 'pdf',
      size: sample('html').length,
      declaredType: 'application/pdf',
      detected: FILE_TYPES.html,
      type: 'text/html',
      mismatch: true,
      risks: ['active-content', 'type-mismatch'],
    });
  });

  it('reports every risk, in a stable order', async () => {
    expect((await inspectFile(file(sample('exe'), 'invoice.pdf\u200B.exe'))).risks).toEqual(['executable', 'double-extension', 'hidden-characters']);
    expect((await inspectFile(file(sample('text'), 'run.bat'))).risks).toEqual(['executable']);
    expect((await inspectFile(file(sample('docx'), 'budget.docm'))).risks).toEqual(['macros']);
    expect((await inspectFile(file(bytes(zipEntry('word/document.xml'), zipEntry('word/vbaProject.bin')), 'a.docx'))).risks).toEqual(['macros']);
    expect((await inspectFile(file(sample('text'), 'page.htm'))).risks).toEqual(['active-content']);
    expect((await inspectFile(file(new Uint8Array(), 'empty.pdf'))).risks).toEqual(['empty']);
    expect((await inspectFile(file(sample('pdf'), 'report.pdf'))).risks).toEqual([]);
  });

  it('types plain text by its extension, and unknown content as octet-stream', async () => {
    expect((await inspectFile(file(utf8('a,b\n1,2'), 'data.csv'))).type).toBe('text/csv');
    expect((await inspectFile(file(utf8('a,b'), 'notes.txt'))).type).toBe('text/plain');
    expect((await inspectFile(file(utf8('a,b'), 'README'))).type).toBe('text/plain');
    expect((await inspectFile(file(sample('html'), 'page.csv'))).type).toBe('text/html');
    expect((await inspectFile(file(bytes([0, 1, 2]), 'drawing.dwg'))).type).toBe('application/octet-stream');
  });

  it('takes a Blob with a name and a claimed type from the options', async () => {
    const blob = new Blob([sample('png') as BlobPart], { type: 'image/gif' });
    expect(await inspectFile(blob)).toMatchObject({ name: '', safeName: 'file', extension: null, declaredType: 'image/gif', type: 'image/png' });
    expect(await inspectFile(blob, { name: 'x/../logo.png', declaredType: 'image/png', names: { fallback: 'upload' } })).toMatchObject({
      name: 'x/../logo.png',
      safeName: 'logo.png',
      declaredType: 'image/png',
      mismatch: false,
    });
  });

  it('reads only the head of a large file', async () => {
    const big = new Uint8Array(1_000_000);
    big.set(sample('pdf'));
    const blob = new Blob([big]);
    const slice = vi.spyOn(blob, 'slice');
    expect((await inspectFile(blob, { name: 'big.pdf' })).type).toBe('application/pdf');
    expect(slice).toHaveBeenCalledWith(0, 8192);
  });

  it('refuses what is not a Blob', async () => {
    await expect(inspectFile('report.pdf' as unknown as Blob)).rejects.toMatchObject({ copyError: { type: 'invalid-payload' } });
    await expect(inspectFile(null as unknown as Blob)).rejects.toMatchObject({ copyError: { type: 'invalid-payload' } });
  });

  it('builds inspections from bytes, as servers do', () => {
    expect(inspectBytes(sample('pdf'), 'a.pdf', '', 10, true).risks).toEqual([]);
  });
});

describe('accept lists', () => {
  it('parses tokens as <input accept> does, dropping invalid ones', () => {
    expect(parseAccept(' .PDF, image/*,text/csv,, bad token, */*, *, a/b/c, .tar.gz ')).toEqual(['.pdf', 'image/*', 'text/csv', '*/*', '*', '.tar.gz']);
    expect(parseAccept(['.CSV', 'Application/JSON'])).toEqual(['.csv', 'application/json']);
  });

  const inspect = (data: Uint8Array, name: string) => inspectBytes(data, name, '', data.length, true);

  it('matches by content and extension together', () => {
    const pdf = inspect(sample('pdf'), 'report.pdf');
    const fake = inspect(sample('html'), 'report.pdf');
    const csv = inspect(utf8('a,b'), 'data.csv');
    const docx = inspect(sample('docx'), 'letter.docx');
    const dwg = inspect(bytes([0, 1]), 'plan.dwg');
    expect(matchesAccept(pdf, '.pdf')).toBe(true);
    expect(matchesAccept(fake, '.pdf')).toBe(false);
    expect(matchesAccept(pdf, 'application/pdf')).toBe(true);
    expect(matchesAccept(fake, 'application/pdf')).toBe(false);
    expect(matchesAccept(pdf, 'image/*, .png')).toBe(false);
    expect(matchesAccept(inspect(sample('png'), 'a.png'), 'image/*')).toBe(true);
    expect(matchesAccept(csv, 'text/csv')).toBe(true);
    expect(matchesAccept(csv, 'text/*')).toBe(true);
    expect(matchesAccept(inspect(sample('html'), 'data.csv'), 'text/csv')).toBe(false);
    expect(matchesAccept(docx, 'application/zip')).toBe(true);
    expect(matchesAccept(docx, '.docx')).toBe(true);
    expect(matchesAccept(dwg, '.dwg')).toBe(true);
    expect(matchesAccept(dwg, 'application/*')).toBe(false);
    expect(matchesAccept(dwg, 'application/octet-stream')).toBe(true);
    expect(matchesAccept(inspect(sample('gzip'), 'logs.tar.gz'), '.tar.gz')).toBe(true);
    expect(matchesAccept(dwg, '*/*')).toBe(true);
    expect(matchesAccept(dwg, '*')).toBe(true);
    expect(matchesAccept(dwg, '')).toBe(true);
    expect(matchesAccept(inspect(utf8('x'), 'README'), 'text/plain')).toBe(true);
  });
});
