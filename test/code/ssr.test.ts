// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cleanCode, codePayload, inspectCode, normalizeCode, pasteToCode } from '../../src/code';

describe('react-smart-copy/code on the server', () => {
  it('has no DOM to rely on here', () => {
    expect(typeof DOMParser).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });

  it('inspects, cleans, normalises and builds string payloads anywhere', () => {
    expect(inspectCode('\u202E').danger).toBe(true);
    expect(cleanCode('\u201Cx\u201D').code).toBe('"x"');
    expect(normalizeCode('$ ls\nout')).toBe('ls');
    expect(codePayload('x', { html: false })).toEqual({ kind: 'text', value: 'x' });
  });

  it('pastes text, and has no HTML fallback without DOMParser', () => {
    expect(pasteToCode({ text: 'x' })?.code).toBe('x');
    expect(pasteToCode({ html: '<pre>x</pre>' })).toBeNull();
  });
});
