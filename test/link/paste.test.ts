import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyFailure } from '../../src/core/errors';
import { pasteAsLink, readLink, selectionLink, type LinkPasteEvent } from '../../src/link';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  window.getSelection()?.removeAllRanges();
});

describe('readLink', () => {
  it('reads text that is exactly one URL', () => {
    expect(readLink({ text: '  https://example.com/a  ' })).toEqual({ url: 'https://example.com/a', title: 'https://example.com/a', titled: false });
    expect(readLink({ text: '<https://example.com/b>' })).toMatchObject({ url: 'https://example.com/b' });
    expect(readLink({ text: 'see https://example.com' })).toBeNull();
    expect(readLink({ text: 'https://a.example https://b.example' })).toBeNull();
    expect(readLink({ text: 'plain words' })).toBeNull();
    expect(readLink({})).toBeNull();
  });

  it('never returns an unsafe or credentialed link', () => {
    expect(readLink({ text: 'javascript:alert(1)' })).toBeNull();
    expect(readLink({ uriList: 'data:text/html,x' })).toBeNull();
    expect(readLink({ html: '<a href="javascript:alert(1)">click</a>' })).toBeNull();
    expect(readLink({ text: 'https://u:p@example.com/' })).toMatchObject({ url: 'https://example.com/' });
  });

  it('keeps the title of HTML that is exactly one link', () => {
    expect(readLink({ html: '<meta charset="utf-8"><a href="https://example.com/docs"> The\n docs\u202E </a>', text: 'The docs' })).toEqual({ url: 'https://example.com/docs', title: 'The docs', titled: true });
    expect(readLink({ html: '<a href="https://example.com/">https://example.com/</a>' })).toMatchObject({ titled: false });
    expect(readLink({ html: '<a href="https://example.com/"><img alt=""></a>' })).toEqual({ url: 'https://example.com/', title: 'https://example.com/', titled: false });
    expect(readLink({ html: 'Read <a href="https://example.com/">this</a> now' })).toBeNull();
    expect(readLink({ html: '<a href="https://a.example/">a</a><a href="https://b.example/">b</a>' })).toBeNull();
    expect(readLink({ html: '   ' })).toBeNull();
    expect(readLink({ html: '<a href="https://a.example/">a</a> extra', text: 'https://b.example/' })).toMatchObject({ url: 'https://b.example/' });
  });

  it('prefers text/uri-list, with the HTML title when it is the same link', () => {
    expect(readLink({ uriList: '# comment\r\n\r\nhttps://example.com/x\r\nhttps://other.example/' })).toEqual({ url: 'https://example.com/x', title: 'https://example.com/x', titled: false });
    expect(readLink({ uriList: 'https://example.com/x', html: '<a href="https://example.com/x">X</a>' })).toMatchObject({ title: 'X', titled: true });
    expect(readLink({ uriList: 'https://example.com/x', html: '<a href="https://example.com/y">Y</a>' })).toMatchObject({ url: 'https://example.com/x', titled: false });
    expect(readLink({ uriList: '# only a comment', text: 'https://example.com/z' })).toMatchObject({ url: 'https://example.com/z' });
    expect(readLink({ items: [{ type: 'text/plain', data: 'x' }, { type: 'text/uri-list', data: 'https://example.com/i' }] })).toMatchObject({ url: 'https://example.com/i' });
    expect(readLink({ items: [{ type: 'text/uri-list', data: new Blob(['https://example.com']) }] })).toBeNull();
  });

  it('applies URL options, and throws for invalid options instead of hiding them', () => {
    expect(readLink({ text: 'https://x.example/?utm_source=a' }, { clean: true })).toMatchObject({ url: 'https://x.example/' });
    expect(readLink({ html: '<a href="/docs">Docs</a>' }, { base: 'https://x.example/' })).toMatchObject({ url: 'https://x.example/docs' });
    expect(() => readLink({ text: 'https://x' }, { protocols: [] })).toThrow(CopyFailure);
    expect(() => readLink({ text: 'https://x' }, { clean: 1 as never })).toThrow(CopyFailure);
  });

  it('reads only text without a DOMParser (outside a browser)', () => {
    vi.stubGlobal('DOMParser', undefined);
    expect(readLink({ html: '<a href="https://example.com/">x</a>', text: 'https://example.com/t' })).toMatchObject({ url: 'https://example.com/t' });
  });
});

interface Clip {
  readonly text?: string;
  readonly html?: string;
  readonly uriList?: string;
}

function setup(value: string, start: number, end: number, clip: Clip | null, field: 'textarea' | 'input' | 'div' = 'textarea') {
  const element = document.createElement(field);
  document.body.append(element);
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    element.value = value;
    element.setSelectionRange(start, end);
  }
  const preventDefault = vi.fn();
  const formats: Record<string, string | undefined> = { 'text/plain': clip?.text, 'text/html': clip?.html, 'text/uri-list': clip?.uriList };
  const event: LinkPasteEvent = {
    clipboardData: clip === null ? null : { getData: (format) => formats[format] ?? '' },
    currentTarget: element,
    target: element,
    defaultPrevented: false,
    preventDefault,
  };
  return { element: element as HTMLTextAreaElement, event, preventDefault }; // `value` is read only for text fields.
}

describe('pasteAsLink', () => {
  it('turns the selection into a Markdown link, escaped', () => {
    const { element, event, preventDefault } = setup('Read the [docs] now', 9, 15, { text: 'https://example.com/docs (v2)' });
    expect(pasteAsLink(event)).toBe(false); // Not one URL: the text has a space.
    const next = setup('Read the [docs] now', 9, 15, { text: 'https://example.com/docs' });
    expect(pasteAsLink(next.event)).toBe(true);
    expect(next.preventDefault).toHaveBeenCalledOnce();
    expect(next.element.value).toBe('Read the [\\[docs\\]](https://example.com/docs) now');
    expect(preventDefault).not.toHaveBeenCalled();
    expect(element.value).toBe('Read the [docs] now');
  });

  it('works in inputs, from HTML and uri-list, and with a custom format', () => {
    const input = setup('hello world', 6, 11, { html: '<a href="https://w.example/">W</a>' }, 'input');
    expect(pasteAsLink(input.event, { format: (text, link) => `<${link.url}|${text}>` })).toBe(true);
    expect(input.element.value).toBe('hello <https://w.example/|world>');
    const list = setup('a b', 0, 1, { uriList: 'https://u.example/' });
    expect(pasteAsLink(list.event, { clean: true })).toBe(true);
    expect(list.element.value).toBe('[a](https://u.example/) b');
  });

  it('leaves every other paste to the browser', () => {
    const cases = [
      setup('text', 2, 2, { text: 'https://example.com' }), // Nothing selected.
      setup('a    b', 1, 4, { text: 'https://example.com' }), // Only spaces selected.
      setup('see https://old.example', 4, 23, { text: 'https://new.example' }), // Replacing a URL.
      setup('text', 0, 4, { text: 'not a link' }),
      setup('text', 0, 4, { text: 'javascript:alert(1)' }),
      setup('text', 0, 4, null),
      setup('text', 0, 4, { text: 'https://example.com' }, 'div'),
    ];
    for (const { event, preventDefault } of cases) {
      expect(pasteAsLink(event)).toBe(false);
      expect(preventDefault).not.toHaveBeenCalled();
    }
    const handled = setup('text', 0, 4, { text: 'https://example.com' });
    expect(pasteAsLink({ ...handled.event, defaultPrevented: true })).toBe(false);
    const disabled = setup('text', 0, 4, { text: 'https://example.com' });
    disabled.element.disabled = true;
    expect(pasteAsLink(disabled.event)).toBe(false);
    const readOnly = setup('text', 0, 4, { text: 'https://example.com' });
    readOnly.element.readOnly = true;
    expect(pasteAsLink(readOnly.event)).toBe(false);
    const email = setup('', 0, 0, { text: 'https://example.com' }, 'input');
    const emailInput = email.element as unknown as HTMLInputElement;
    emailInput.type = 'email';
    emailInput.value = 'a@b.c';
    expect(pasteAsLink(email.event)).toBe(false);
  });

  it('finds the field from the event target when currentTarget is not one', () => {
    const { element, event } = setup('word', 0, 4, { text: 'https://example.com/' });
    expect(pasteAsLink({ ...event, currentTarget: document.body })).toBe(true);
    expect(element.value).toBe('[word](https://example.com/)');
  });

  it('throws for invalid options and for a format that returns no string, leaving the native paste', () => {
    const invalid = setup('word', 0, 4, { text: 'https://example.com/' });
    expect(() => pasteAsLink(invalid.event, { protocols: [] })).toThrow(CopyFailure);
    expect(invalid.preventDefault).not.toHaveBeenCalled();
    const bad = setup('word', 0, 4, { text: 'https://example.com/' });
    expect(() => pasteAsLink(bad.event, { format: () => 1 as never })).toThrow(CopyFailure);
    expect(bad.preventDefault).not.toHaveBeenCalled();
  });
});

describe('selectionLink', () => {
  function selectText(html: string, selector: string, from: number, to: number): void {
    document.body.innerHTML = html;
    const text = (document.querySelector(selector) as Element).firstChild as Node;
    const range = document.createRange();
    range.setStart(text, from);
    range.setEnd(text, to);
    const selection = window.getSelection() as Selection;
    selection.removeAllRanges();
    selection.addRange(range);
  }

  it('links the selected passage, with the page title and the quote', () => {
    document.title = 'Guide \u200B';
    selectText('<p id="p">Copy   links that\npaste well.</p>', '#p', 7, 23);
    expect(selectionLink({ url: 'https://example.com/guide#top' })).toEqual({
      url: 'https://example.com/guide#top:~:text=links%20that%20paste',
      title: 'Guide',
      titled: true,
      quote: 'links that paste',
    });
    document.title = '';
    expect(selectionLink({ url: 'https://example.com/' })).toMatchObject({ title: 'https://example.com/#:~:text=links%20that%20paste', titled: false });
    expect(selectionLink()?.url.startsWith(`${location.href.split('#')[0] as string}#:~:text=`)).toBe(true);
  });

  it('returns null with nothing selected, a blank selection, or outside a browser', () => {
    expect(selectionLink()).toBeNull();
    selectText('<p id="p">a    b</p>', '#p', 1, 5);
    expect(selectionLink()).toBeNull();
    selectText('<p id="p">text</p>', '#p', 2, 2);
    expect(selectionLink()).toBeNull();
    vi.spyOn(window, 'getSelection').mockReturnValue(null);
    expect(selectionLink()).toBeNull();
    vi.stubGlobal('window', undefined);
    expect(selectionLink()).toBeNull();
  });
});
