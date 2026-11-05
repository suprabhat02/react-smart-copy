import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserClipboardAdapter, registerCopyInterceptor, type ClipboardEnvironment, type CopyPayload } from '../src/core';
import { legacyCopy, legacyEntries } from '../src/core/legacy-copy';

/** What the copy event's clipboardData received. */
function fakeData(options: { readonly failOn?: string } = {}) {
  const data = new Map<string, string>();
  return {
    data,
    setData: vi.fn((format: string, value: string) => {
      if (format === options.failOn) throw new Error('refused');
      data.set(format, value);
    }),
  };
}

/**
 * Makes `document.execCommand('copy')` behave like a browser's: it fires a cancelable `copy`
 * event at the focused element (or the body) and returns `result`.
 */
function browserCopyCommand(clipboardData: ReturnType<typeof fakeData> | null, result = true) {
  const seenSelection: string[] = [];
  const command = vi.fn((name: string) => {
    expect(name).toBe('copy');
    seenSelection.push(document.getSelection()?.toString() ?? '');
    const event = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: clipboardData });
    (document.activeElement ?? document.body).dispatchEvent(event);
    return result;
  });
  Object.defineProperty(document, 'execCommand', { value: command, configurable: true, writable: true });
  return { command, seenSelection };
}

afterEach(() => {
  Reflect.deleteProperty(document, 'execCommand');
  document.body.replaceChildren();
  document.getSelection()?.removeAllRanges();
});

describe('legacyEntries', () => {
  it.each<[string, CopyPayload, unknown]>([
    ['text', { kind: 'text', value: 'a' }, [['text/plain', 'a']]],
    ['json', { kind: 'json', value: { a: 1 }, pretty: false }, [['text/plain', '{"a":1}']]],
    ['html', { kind: 'html', html: '<b>a</b>', text: 'a' }, [['text/html', '<b>a</b>'], ['text/plain', 'a']]],
    ['an image', { kind: 'image', blob: new Blob([], { type: 'image/png' }) }, null],
    [
      'multi, skipping what a copy event cannot carry when it is optional',
      {
        kind: 'multi',
        items: [
          { mimeType: 'text/plain', data: 'a' },
          { mimeType: 'web application/x-a', data: 'b', optional: true },
          { mimeType: 'image/png', data: new Blob([]), optional: true },
        ],
      },
      [['text/plain', 'a']],
    ],
    ['multi with a required blob', { kind: 'multi', items: [{ mimeType: 'text/plain', data: 'a' }, { mimeType: 'image/png', data: new Blob([]) }] }, null],
    ['multi with a required web custom format', { kind: 'multi', items: [{ mimeType: 'web application/x-a', data: 'b' }] }, null],
    ['multi with nothing it can carry', { kind: 'multi', items: [{ mimeType: 'image/png', data: new Blob([]), optional: true }] }, null],
  ])('maps %s', (_label, payload, expected) => {
    expect(legacyEntries(payload)).toEqual(expected);
  });
});

describe('legacyCopy', () => {
  it('writes every format exactly, and leaves no trace in the page', () => {
    const data = fakeData();
    const { seenSelection } = browserCopyCommand(data);
    expect(legacyCopy(document, [['text/html', '<b>a</b>'], ['text/plain', 'a b']])).toBe(true);
    expect([...data.data]).toEqual([['text/html', '<b>a</b>'], ['text/plain', 'a b']]);
    // The command saw a selection (it is disabled without one), of the plain text.
    expect(seenSelection).toEqual(['a b']);
    expect(document.body.childElementCount).toBe(0);
  });

  it('is not rewritten by page copy handlers or copy interceptors', () => {
    const host = document.createElement('article');
    host.textContent = 'page text';
    document.body.append(host);
    const transform = vi.fn(() => 'rewritten');
    const stop = registerCopyInterceptor(document.body, { transform });
    const pageHandler = vi.fn();
    document.addEventListener('copy', pageHandler);
    const data = fakeData();
    browserCopyCommand(data);
    expect(legacyCopy(document, [['text/plain', 'exact']])).toBe(true);
    expect(data.data.get('text/plain')).toBe('exact');
    expect(transform).not.toHaveBeenCalled();
    expect(pageHandler).not.toHaveBeenCalled();
    document.removeEventListener('copy', pageHandler);
    stop();
  });

  it("puts the user's selection back", () => {
    const paragraph = document.createElement('p');
    paragraph.textContent = 'what the user selected';
    document.body.append(paragraph);
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    document.getSelection()?.addRange(range);
    browserCopyCommand(fakeData());
    expect(legacyCopy(document, [['text/plain', 'x']])).toBe(true);
    expect(document.getSelection()?.toString()).toBe('what the user selected');
  });

  it("puts the focus and the field's own selection back", () => {
    const field = document.createElement('textarea');
    field.value = 'hello world';
    document.body.append(field);
    field.focus();
    field.setSelectionRange(2, 7, 'backward');
    browserCopyCommand(fakeData());
    // Moving the selection to the holder moves focus in some engines.
    const blur = vi.spyOn(document, 'getSelection').mockImplementation(function (this: Document) {
      field.blur();
      blur.mockRestore();
      return this.getSelection();
    });
    expect(legacyCopy(document, [['text/plain', 'x']])).toBe(true);
    expect(document.activeElement).toBe(field);
    expect([field.selectionStart, field.selectionEnd, field.selectionDirection]).toEqual([2, 7, 'backward']);
  });

  it('restores focus to a field without a selection API, and ignores a focused element that is gone', () => {
    const email = document.createElement('input');
    email.type = 'email';
    document.body.append(email);
    email.focus();
    browserCopyCommand(fakeData());
    expect(legacyCopy(document, [['text/plain', 'x']])).toBe(true);
    expect(document.activeElement).toBe(email);

    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    const data = fakeData();
    browserCopyCommand(data);
    data.setData.mockImplementationOnce(() => {
      button.remove();
    });
    expect(legacyCopy(document, [['text/plain', 'x']])).toBe(true);
    expect(button.isConnected).toBe(false);
  });

  it('treats an engine that reports no selection direction as none', () => {
    const field = document.createElement('input');
    field.value = 'abcdef';
    Object.defineProperty(field, 'selectionDirection', { get: () => null });
    document.body.append(field);
    field.focus();
    field.setSelectionRange(1, 3);
    const restore = vi.spyOn(field, 'setSelectionRange');
    browserCopyCommand(fakeData());
    expect(legacyCopy(document, [['text/plain', 'x']])).toBe(true);
    expect(restore).toHaveBeenLastCalledWith(1, 3, 'none');
  });

  it('copes with older engines that throw when a field without a selection API is asked for one', () => {
    const number = document.createElement('input');
    number.type = 'number';
    Object.defineProperty(number, 'selectionStart', {
      get: () => {
        throw new DOMException('no selection', 'InvalidStateError');
      },
    });
    document.body.append(number);
    number.focus();
    browserCopyCommand(fakeData());
    expect(legacyCopy(document, [['text/plain', 'x']])).toBe(true);
    expect(document.activeElement).toBe(number);
  });

  it('copies a non-breaking space so an empty payload still enables the command', () => {
    const data = fakeData();
    const { seenSelection } = browserCopyCommand(data);
    expect(legacyCopy(document, [['text/plain', '']])).toBe(true);
    expect(seenSelection).toEqual([' ']);
    expect(data.data.get('text/plain')).toBe('');
    expect(legacyCopy(document, [['text/html', '<i></i>']])).toBe(true);
    expect(seenSelection).toEqual([' ', ' ']);
  });

  it('fails honestly where the copy event has no clipboardData (pre-2015 engines)', () => {
    browserCopyCommand(null, true);
    expect(legacyCopy(document, [['text/plain', 'a']])).toBe(false);
    expect(document.body.childElementCount).toBe(0);
  });

  it('fails without writing when the browser refuses a format', () => {
    browserCopyCommand(fakeData({ failOn: 'text/html' }));
    expect(legacyCopy(document, [['text/html', '<b>a</b>'], ['text/plain', 'a']])).toBe(false);
  });

  it('fails when the command throws, is missing, or there is no body', () => {
    Object.defineProperty(document, 'execCommand', {
      value: () => {
        throw new Error('blocked');
      },
      configurable: true,
    });
    expect(legacyCopy(document, [['text/plain', 'a']])).toBe(false);
    expect(document.body.childElementCount).toBe(0);
    Object.defineProperty(document, 'execCommand', { value: undefined, configurable: true });
    expect(legacyCopy(document, [['text/plain', 'a']])).toBe(false);
    browserCopyCommand(fakeData());
    const body = vi.spyOn(document, 'body', 'get').mockReturnValue(null as unknown as HTMLElement);
    expect(legacyCopy(document, [['text/plain', 'a']])).toBe(false);
    body.mockRestore();
  });

  it('works when the document has no selection object', () => {
    const data = fakeData();
    browserCopyCommand(data);
    const selection = vi.spyOn(document, 'getSelection').mockReturnValue(null);
    expect(legacyCopy(document, [['text/plain', 'a']])).toBe(true);
    expect(data.data.get('text/plain')).toBe('a');
    selection.mockRestore();
  });
});

describe('the browser adapter falls back to the copy command', () => {
  const adapter = (env: ClipboardEnvironment, legacyFallback?: boolean) =>
    createBrowserClipboardAdapter({ getEnvironment: () => env, ...(legacyFallback === undefined ? {} : { legacyFallback }) });

  it('on a plain-HTTP page, for text, JSON and HTML', async () => {
    const data = fakeData();
    browserCopyCommand(data);
    const http = adapter({ isSecureContext: false, document });
    await http.write({ kind: 'text', value: 'a' });
    expect(data.data.get('text/plain')).toBe('a');
    const html = fakeData();
    browserCopyCommand(html);
    await http.write({ kind: 'html', html: '<b>b</b>', text: 'b' });
    expect([...html.data]).toEqual([['text/html', '<b>b</b>'], ['text/plain', 'b']]);
  });

  it('but never for images, and never when it is turned off', async () => {
    browserCopyCommand(fakeData());
    await expect(adapter({ isSecureContext: false, document }).write({ kind: 'image', blob: new Blob([], { type: 'image/png' }) })).rejects.toMatchObject({
      copyError: { type: 'insecure-context' },
    });
    await expect(adapter({ isSecureContext: false, document }, false).write({ kind: 'text', value: 'a' })).rejects.toMatchObject({
      copyError: { type: 'insecure-context' },
    });
    await expect(adapter({ isSecureContext: false }).write({ kind: 'text', value: 'a' })).rejects.toMatchObject({
      copyError: { type: 'insecure-context' },
    });
  });

  it('when the browser has no navigator.clipboard, or no writeText', async () => {
    const data = fakeData();
    browserCopyCommand(data);
    await adapter({ navigator: {}, document }).write({ kind: 'json', value: [1], pretty: false });
    expect(data.data.get('text/plain')).toBe('[1]');
    await adapter({ navigator: { clipboard: {} }, document }).write({ kind: 'text', value: 'c' });
    expect(data.data.get('text/plain')).toBe('c');
    browserCopyCommand(null, false);
    await expect(adapter({ navigator: { clipboard: {} }, document }).write({ kind: 'text', value: 'c' })).rejects.toMatchObject({
      copyError: { type: 'unsupported' },
    });
  });

  it('writes real HTML where ClipboardItem is missing, before degrading it to text', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const data = fakeData();
    browserCopyCommand(data);
    await adapter({ navigator: { clipboard: { writeText } }, document }).write({ kind: 'html', html: '<b>d</b>', text: 'd' });
    expect(data.data.get('text/html')).toBe('<b>d</b>');
    expect(writeText).not.toHaveBeenCalled();
    // When the copy command fails too, the old behaviour: plain text, or an honest error.
    browserCopyCommand(null, false);
    await adapter({ navigator: { clipboard: { writeText } }, document }).write({ kind: 'html', html: '<b>d</b>', text: 'd' });
    expect(writeText).toHaveBeenCalledWith('d');
    const strict = createBrowserClipboardAdapter({ getEnvironment: () => ({ navigator: { clipboard: { writeText } }, document }), degradeHtmlToText: false });
    await expect(strict.write({ kind: 'html', html: '<b>d</b>', text: 'd' })).rejects.toMatchObject({ copyError: { type: 'unsupported-format' } });
    await expect(adapter({ navigator: { clipboard: {} }, document }).write({ kind: 'html', html: '<b>d</b>', text: 'd' })).rejects.toMatchObject({
      copyError: { type: 'unsupported-format' },
    });
  });

  it('copies multi-format text where ClipboardItem is missing', async () => {
    const data = fakeData();
    browserCopyCommand(data);
    await adapter({ navigator: { clipboard: {} }, document }).write({
      kind: 'multi',
      items: [
        { mimeType: 'text/plain', data: 'a\tb' },
        { mimeType: 'text/html', data: '<table></table>' },
      ],
    });
    expect([...data.data]).toEqual([['text/plain', 'a\tb'], ['text/html', '<table></table>']]);
  });
});
