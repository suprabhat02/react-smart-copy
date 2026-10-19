// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cleanLinkUrl, linkPayload, readLink, selectionLink, supportsTextFragments, textFragmentUrl } from '../../src/link';

describe('react-smart-copy/link on the server', () => {
  it('has no DOM to rely on here', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof location).toBe('undefined');
  });

  it('builds payloads, cleans links and makes fragment links for absolute URLs', () => {
    expect(linkPayload({ url: 'https://example.com/?utm_source=x', title: 'Example' }, { clean: true })).toEqual({
      kind: 'html',
      html: '<a href="https://example.com/">Example</a>',
      text: 'https://example.com/',
    });
    expect(cleanLinkUrl('https://example.com/?gclid=1&q=2')).toBe('https://example.com/?q=2');
    expect(textFragmentUrl('https://example.com/', 'hello world')).toBe('https://example.com/#:~:text=hello%20world');
  });

  it('needs a base for relative links, and reads only text from a paste', () => {
    expect(() => linkPayload('/docs')).toThrow(expect.objectContaining({ copyError: expect.objectContaining({ type: 'invalid-payload' }) }));
    expect(linkPayload('/docs', { base: 'https://example.com' }).text).toBe('https://example.com/docs');
    expect(readLink({ html: '<a href="https://a.example/">A</a>', text: 'https://b.example/' })).toMatchObject({ url: 'https://b.example/' });
  });

  it('reports no selection and no text fragment support', () => {
    expect(selectionLink()).toBeNull();
    expect(supportsTextFragments()).toBe(false);
  });
});
