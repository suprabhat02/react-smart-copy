import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkCorpus } from './check';
import { privacyProblems } from './privacy';
import { runCorpus } from './run';
import { captureProblems, MAX_FLAVOUR_LENGTH, type Capture } from './schema';

const SOURCE = { app: 'Test App', appVersion: '1.0', os: 'Linux', browser: 'Chrome 130', capturedAt: '2026-11-02' };
const make = (types: Record<string, string>, extra: object = {}): Capture => ({ schema: 1, id: 'sample-capture', source: SOURCE, types, ...extra });

/** The harness itself is tested here, on made-up captures: real ones live in captures/. */
describe('the corpus harness', () => {
  it('accepts a well-formed capture', () => {
    expect(captureProblems(make({ 'text/plain': 'x' }, { note: 'n', files: [{ name: 'a.png', type: 'image/png', size: 3 }] }), 'sample-capture')).toEqual([]);
  });

  it('accepts the format names real apps use, which are not all MIME types', () => {
    const types = { 'text/html': 'x', 'application/x-vnd.google-docs-embedded-grid_range_clip+wrapped': 'x', 'vscode-editor-data': 'x', 'application/x-vnd.google-spreadsheet-compact-table+json': 'x' };
    expect(captureProblems(make(types), 'sample-capture')).toEqual([]);
  });

  it.each([
    ['not an object', [], 'is not an object'],
    ['an unknown field', { ...make({ 'text/plain': 'x' }), extra: 1 }, 'unknown field "extra"'],
    ['a wrong schema', { ...make({ 'text/plain': 'x' }), schema: 2 }, 'schema must be 1'],
    ['an id that is not the file name', make({ 'text/plain': 'x' }), 'id must be "other-name"'],
    ['no source', { ...make({ 'text/plain': 'x' }), source: 1 }, 'source must be an object'],
    ['an empty source field', make({ 'text/plain': 'x' }, { source: { ...SOURCE, os: ' ' } }), 'source.os must be text'],
    ['a bad date', make({ 'text/plain': 'x' }, { source: { ...SOURCE, capturedAt: '2 Nov' } }), 'YYYY-MM-DD'],
    ['an unknown source field', make({ 'text/plain': 'x' }, { source: { ...SOURCE, who: 'me' } }), 'unknown field "who"'],
    ['a note that is not text', make({ 'text/plain': 'x' }, { note: 1 }), 'note must be text'],
    ['no flavours', make({}), 'at least one flavour'],
    ['a flavour that is not a lower-case name', make({ 'Text/HTML': 'x' }), 'not a lower-case format name'],
    ['a flavour with a space in its name', make({ 'text/ html': 'x' }), 'not a lower-case format name'],
    ['a flavour that is not text', make({ 'text/plain': 1 as unknown as string }), 'must be text'],
    ['a flavour that is too long', make({ 'text/plain': 'x'.repeat(MAX_FLAVOUR_LENGTH + 1) }), 'is longer than'],
    ['files that are not a list', make({ 'text/plain': 'x' }, { files: 1 }), 'files must be a list'],
    ['a malformed file', make({ 'text/plain': 'x' }, { files: [{ name: 'a', type: 'b', size: -1 }] }), 'every file needs'],
  ])('refuses %s', (_name, value, problem) => {
    const id = problem.includes('other-name') ? 'other-name' : 'sample-capture';
    expect(captureProblems(value, id).join('\n')).toContain(problem);
  });

  it('refuses a file name that is not lower-case words', () => {
    expect(captureProblems({ ...make({ 'text/plain': 'x' }), id: 'Bad_Name' }, 'Bad_Name').join('\n')).toContain('lower-case words');
  });

  it('keeps private data out: secrets, and addresses at real domains', () => {
    expect(privacyProblems(make({ 'text/plain': 'ana@example.com, bo@mail.example.org, cy@host.test' }))).toEqual([]);
    // Slack's emoji images: a pixel-density suffix, not an address.
    expect(privacyProblems(make({ 'text/html': '<img src="https://a.slack-edge.com/emoji/2705@2x.png"><img src="/i/logo@1.5x.webp">' }))).toEqual([]);
    expect(privacyProblems(make({ 'text/plain': 'dee@2xy.com' })).join('\n')).toContain('real domain');
    expect(privacyProblems(make({ 'text/html': '<p>dee@gmail.com</p>' })).join('\n')).toContain('an address at a real domain: **e@gmail.com');
    expect(privacyProblems(make({ 'text/plain': 'key AKIAIOSFODNN7EXAMPLE' })).join('\n')).toContain('a secret');
  });

  it('keeps account names out of file paths, in every spelling Office and RTF use', () => {
    for (const path of ['file:///C:/Users/ana/AppData/clip.htm', 'C:\\Users\\ana\\x', 'C:\\\\Users\\\\ana\\\\x', 'file:///Users/ana/x', 'file://home/ana/x']) {
      expect(privacyProblems(make({ 'text/html': `<link href="${path}">` })), path).toEqual(['text/html holds a path into a home folder, which names its account: write the name as "user"']);
    }
    expect(privacyProblems(make({ 'text/html': '<link href="file:///C:/Users/user/AppData/clip.htm"> https://example.com/home/ana/' }))).toEqual([]);
  });

  it('runs every converter, and records what each made of the capture', () => {
    const results = runCorpus(make({ 'text/html': '<table><tr><td>a</td><td>b</td></tr></table>', 'text/plain': '1,234.50', 'text/uri-list': 'https://example.com/' }));
    expect(Object.keys(results)).toEqual(['markdown', 'rich', 'table', 'code', 'link', 'number', 'addresses', 'otp', 'secrets']);
    expect(results['number']).toMatchObject({ exact: '1234.50' });
    expect(results['link']).toMatchObject({ url: 'https://example.com/' });
    expect(results['table']).toMatchObject({ rows: [['a', 'b']] });
  });

  it('runs converters that read only the text, and ones that read none, on a capture without it', () => {
    const results = runCorpus(make({ 'image/png': 'x' }));
    expect(results['number']).toBeNull();
    expect(results['addresses']).toBeNull();
    expect(results['otp']).toBeNull();
    expect(results['secrets']).toBeNull();
    expect(results['markdown']).toBeNull();
  });

  it('records a converter that throws, by its error type', () => {
    const results = runCorpus(make({ 'text/plain': 'x'.repeat(40_000_000) }));
    expect(results['table']).toEqual({ threw: 'too-large' });
  });
});

describe('the corpus check, on a corpus made for the test', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  function corpus(files: Record<string, string>): { captures: string; expected: string } {
    const root = mkdtempSync(join(tmpdir(), 'corpus-'));
    roots.push(root);
    mkdirSync(join(root, 'captures'));
    for (const [name, content] of Object.entries(files)) writeFileSync(join(root, 'captures', name), content);
    return { captures: join(root, 'captures'), expected: join(root, 'expected') };
  }
  const sample = (id: string, text: string): string => JSON.stringify({ schema: 1, id, source: SOURCE, types: { 'text/plain': text } });

  it('accepts a capture, then holds it to the accepted result', () => {
    const { captures, expected } = corpus({ 'sample-one.capture.json': sample('sample-one', '1,234.50') });
    expect(checkCorpus(captures, expected)).toEqual(['sample-one: no accepted result; run "npm run corpus:accept" and review it']);
    expect(checkCorpus(captures, expected, true)).toEqual([]);
    expect(checkCorpus(captures, expected)).toEqual([]);
    writeFileSync(join(captures, 'sample-one.capture.json'), sample('sample-one', '1.234,50'));
    expect(checkCorpus(captures, expected)).toEqual(['sample-one: converts differently from the accepted result (sample-one.json)']);
  });

  it('reports a capture that is not JSON, is malformed or holds private data', () => {
    const { captures, expected } = corpus({
      'broken-json.capture.json': '{',
      'wrong-id.capture.json': sample('other-id', 'x'),
      'private-one.capture.json': sample('private-one', 'mail dee@gmail.com'),
      'notes.txt': 'ignored',
    });
    const problems = checkCorpus(captures, expected);
    expect(problems).toContain('broken-json: is not valid JSON');
    expect(problems).toContain('wrong-id: id must be "wrong-id", the file\'s name');
    expect(problems.some((problem) => problem.startsWith('private-one: ') && problem.includes('real domain'))).toBe(true);
  });

  it('reports an accepted result whose capture is gone', () => {
    const { captures, expected } = corpus({ 'sample-two.capture.json': sample('sample-two', '5') });
    checkCorpus(captures, expected, true);
    rmSync(join(captures, 'sample-two.capture.json'));
    expect(checkCorpus(captures, expected)).toEqual(['sample-two.json: an accepted result without a capture']);
  });

  it('reports a converter that throws something that is not a CopyFailure', () => {
    const { captures, expected } = corpus({ 'sample-three.capture.json': sample('sample-three', '5') });
    // A converter bug of the kind the corpus exists to find: a raw TypeError out of the HTML reader.
    vi.stubGlobal(
      'DOMParser',
      class {
        parseFromString(): never {
          throw new TypeError('boom');
        }
      },
    );
    try {
      const withHtml = JSON.stringify({ schema: 1, id: 'sample-three', source: SOURCE, types: { 'text/html': '<p>x</p>' } });
      writeFileSync(join(captures, 'sample-three.capture.json'), withHtml);
      expect(checkCorpus(captures, expected, true).some((problem) => problem.includes('not a CopyFailure'))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
