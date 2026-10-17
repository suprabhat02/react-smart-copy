// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { escapeMarkdown, htmlToMarkdown, pasteToMarkdown } from '../../src/markdown';

describe('react-smart-copy/markdown on the server', () => {
  it('has no DOM to rely on here', () => {
    expect(typeof DOMParser).toBe('undefined');
  });

  it('htmlToMarkdown explains that a string needs DOMParser', () => {
    expect(() => htmlToMarkdown('<p>x</p>')).toThrow(expect.objectContaining({ copyError: expect.objectContaining({ type: 'unsupported' }) }));
  });

  it('pasteToMarkdown falls back to the text; escapeMarkdown works anywhere', () => {
    expect(pasteToMarkdown({ html: '<b>x</b>', text: 'x' })).toEqual({ markdown: 'x', source: 'text', truncated: false });
    expect(escapeMarkdown('# *x*')).toBe('\\# \\*x\\*');
  });
});
