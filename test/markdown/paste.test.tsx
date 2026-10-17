import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { escapeMarkdown, insertText, pasteAsMarkdown, pasteToMarkdown } from '../../src/markdown';
import { escapeInline, escapeLineStart } from '../../src/markdown/escape';
import { fakeDataTransfer } from '../fixtures';
import { GOOGLE_DOCS, GOOGLE_DOCS_MD, VS_CODE, VS_CODE_TEXT } from './fixtures';

// jsdom has no execCommand (insertText falls back without it): define one the tests can spy on.
beforeEach(() => {
  Object.defineProperty(document, 'execCommand', { value: () => false, configurable: true, writable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'execCommand');
  document.body.innerHTML = '';
});

describe('escapeMarkdown', () => {
  it('escapes inline syntax, entities and raw HTML', () => {
    expect(escapeInline('\\ ` * _ [ ] < ~ &amp; &#42; & a|b')).toBe('\\\\ \\` \\* \\_ \\[ \\] \\< \\~ \\&amp; \\&#42; & a|b');
    expect(escapeInline('a|b', true)).toBe('a\\|b');
  });

  it('escapes block starts', () => {
    expect(['# a', '> a', '- a', '+ a', '= a', '| a', '1. a', '123456789) a', '1234567890. a', 'a # b'].map(escapeLineStart)).toEqual([
      '\\# a',
      '\\> a',
      '\\- a',
      '\\+ a',
      '\\= a',
      '\\| a',
      '1\\. a',
      '123456789\\) a',
      '1234567890. a',
      'a # b',
    ]);
  });

  it('works line by line and drops leading indentation', () => {
    expect(escapeMarkdown('1. *Not* a list <b>\r\n    # code?\rok')).toBe('1\\. \\*Not\\* a list \\<b>\n\\# code?\nok');
  });
});

describe('pasteToMarkdown', () => {
  it('converts rich content', () => {
    expect(pasteToMarkdown({ html: GOOGLE_DOCS, text: 'plain' })).toEqual({ markdown: GOOGLE_DOCS_MD, source: 'html', truncated: false });
  });

  it('keeps plain text as it is (it is often Markdown already), with line endings normalised', () => {
    expect(pasteToMarkdown({ html: null, text: '**md** source\r\n- item\r' })).toEqual({ markdown: '**md** source\n- item\n', source: 'text', truncated: false });
    expect(pasteToMarkdown({ text: 'x' })).toMatchObject({ source: 'text' });
  });

  it('keeps code from a code editor or a single <pre> as plain text, unless asked otherwise', () => {
    expect(pasteToMarkdown({ html: VS_CODE, text: VS_CODE_TEXT })).toEqual({ markdown: VS_CODE_TEXT, source: 'text', truncated: false });
    expect(pasteToMarkdown({ html: '<pre>a</pre>', text: 'a' })).toMatchObject({ source: 'text' });
    expect(pasteToMarkdown({ html: VS_CODE, text: VS_CODE_TEXT }, { codeAsText: false })).toMatchObject({ source: 'html', markdown: `\`\`\`\n${VS_CODE_TEXT}\n\`\`\`` });
    // Code with prose around it is converted.
    expect(pasteToMarkdown({ html: '<p>Run:</p><pre>a</pre>', text: 'Run:\na' })).toMatchObject({ source: 'html', markdown: 'Run:\n\n```\na\n```' });
    // Without a text flavour there is nothing to fall back to.
    expect(pasteToMarkdown({ html: '<pre>a</pre>', text: '' })).toMatchObject({ source: 'html' });
    // Only whitespace in the HTML is not code.
    expect(pasteToMarkdown({ html: '<p> </p>', text: 'x' })).toMatchObject({ source: 'text' });
  });

  it('falls back to the text when the HTML has nothing to convert, and returns null when nothing was pasted', () => {
    expect(pasteToMarkdown({ html: '<img src="x.png">', text: 'alt' })).toMatchObject({ source: 'text', markdown: 'alt' });
    expect(pasteToMarkdown({ html: '  ', text: null })).toBeNull();
    expect(pasteToMarkdown({})).toBeNull();
    expect(pasteToMarkdown({ html: '<b></b>', text: '' })).toBeNull();
  });

  it('passes options and limits through, and reports truncation', () => {
    expect(pasteToMarkdown({ html: '<p>abcdef</p>' }, { maxLength: 7 })).toEqual({ markdown: 'abcd', source: 'html', truncated: true });
    expect(() => pasteToMarkdown({ html: '<p>x</p>' }, { maxNodes: 0 })).toThrow(/maxNodes/);
  });
});

function field(html: string): HTMLInputElement & HTMLTextAreaElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLInputElement & HTMLTextAreaElement;
}

describe('insertText', () => {
  it('uses execCommand when it inserts (keeps the undo history)', () => {
    const textarea = field('<textarea>ab</textarea>');
    const exec = vi.spyOn(document, 'execCommand').mockReturnValue(true);
    expect(insertText(textarea, 'X')).toBe(true);
    expect(exec).toHaveBeenCalledWith('insertText', false, 'X');
    expect(document.activeElement).toBe(textarea);
  });

  it('falls back to setRangeText + an input event, at the selection', () => {
    const textarea = field('<textarea>hello world</textarea>');
    vi.spyOn(document, 'execCommand').mockReturnValue(false);
    textarea.setSelectionRange(6, 11);
    const onInput = vi.fn<(event: Event) => void>();
    textarea.addEventListener('input', onInput);
    expect(insertText(textarea, 'there')).toBe(true);
    expect(textarea.value).toBe('hello there');
    expect(textarea.selectionStart).toBe(11);
    expect(onInput).toHaveBeenCalledOnce();
    expect(onInput.mock.calls[0]?.[0]).toMatchObject({ inputType: 'insertFromPaste', data: 'there' });
  });

  it('falls back when execCommand throws, and without InputEvent', () => {
    const textarea = field('<textarea></textarea>');
    vi.spyOn(document, 'execCommand').mockImplementation(() => {
      throw new Error('not supported');
    });
    vi.stubGlobal('InputEvent', undefined);
    const onInput = vi.fn();
    textarea.addEventListener('input', onInput);
    try {
      expect(insertText(textarea, 'x')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(textarea.value).toBe('x');
    expect(onInput).toHaveBeenCalledOnce();
  });

  it('respects maxlength without splitting an emoji', () => {
    const roomy = field('<textarea maxlength="5">ab</textarea>');
    roomy.setSelectionRange(2, 2);
    insertText(roomy, 'c😀d');
    expect(roomy.value).toBe('abc😀'); // the emoji is two UTF-16 units, as maxlength counts
    const textarea = field('<textarea maxlength="4">ab</textarea>');
    textarea.setSelectionRange(2, 2);
    insertText(textarea, 'c😀d');
    expect(textarea.value).toBe('abc'); // room for 'c' and half the emoji: the half is dropped
    const full = field('<textarea maxlength="2">ab</textarea>');
    full.setSelectionRange(2, 2);
    insertText(full, 'zz');
    expect(full.value).toBe('ab');
  });

  it('puts single-line text into inputs', () => {
    const input = field('<input type="text" value="a">');
    input.setSelectionRange(1, 1);
    insertText(input, 'b\nc\r\nd  \n\n  e');
    expect(input.value).toBe('ab c d e');
  });

  it('appends to inputs without a selection API (email, number), so React still sees the change', () => {
    function Email() {
      const [value, setValue] = useState('a@');
      return (
        <input
          aria-label="email"
          type="email"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
      );
    }
    render(<Email />);
    const email = screen.getByLabelText<HTMLInputElement>('email');
    expect(email.selectionStart).toBeNull();
    expect(insertText(email, 'x.example')).toBe(true);
    expect(email.value).toBe('a@x.example');
    const limited = field('<input type="email" maxlength="4" value="ab">');
    insertText(limited, 'cdef');
    expect(limited.value).toBe('abcd');
  });

  it('falls back to a plain assignment where the prototype has no value setter', () => {
    const odd = field('<input type="email">');
    Object.setPrototypeOf(odd, Object.create(HTMLElement.prototype, {
      value: { value: '', writable: true },
      selectionStart: { get: () => null },
      selectionEnd: { get: () => null },
      maxLength: { get: () => -1 },
      disabled: { get: () => false },
      readOnly: { get: () => false },
    }) as object);
    expect(insertText(odd as unknown as HTMLInputElement, 'x')).toBe(true);
    expect((odd as unknown as { value: string }).value).toBe('x');
  });

  it('works where execCommand does not exist at all (jsdom, some webviews)', () => {
    Reflect.deleteProperty(document, 'execCommand');
    const textarea = field('<textarea></textarea>');
    expect(insertText(textarea, 'x')).toBe(true);
    expect(textarea.value).toBe('x');
  });

  it('does nothing for disabled or read-only fields', () => {
    expect(insertText(field('<textarea disabled></textarea>'), 'x')).toBe(false);
    expect(insertText(field('<textarea readonly></textarea>'), 'x')).toBe(false);
  });
});

function pasteEvent(target: Element, data: Record<string, string>) {
  return fireEvent.paste(target, { clipboardData: fakeDataTransfer(data) });
}

describe('pasteAsMarkdown', () => {
  function Editor() {
    const [value, setValue] = useState('');
    return (
      <>
        <textarea
          aria-label="editor"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
          onPaste={pasteAsMarkdown}
        />
        <output>{value}</output>
      </>
    );
  }

  it('React: a rich paste is inserted as Markdown and the controlled state follows', () => {
    vi.spyOn(document, 'execCommand').mockReturnValue(false);
    render(<Editor />);
    const editor = screen.getByLabelText('editor');
    const event = pasteEvent(editor, { 'text/html': '<p>Hi <b>there</b></p>', 'text/plain': 'Hi there' });
    expect(event).toBe(false); // default prevented
    expect(screen.getByRole('status').textContent).toBe('Hi **there**');
  });

  it('plain text and code are left to the browser', () => {
    render(<Editor />);
    const editor = screen.getByLabelText('editor');
    expect(pasteEvent(editor, { 'text/plain': '**raw**' })).toBe(true);
    expect(pasteEvent(editor, { 'text/html': VS_CODE, 'text/plain': VS_CODE_TEXT })).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('ignores handled events, events without data, and targets that are not text fields', () => {
    const textarea = field('<textarea></textarea>');
    const base = { currentTarget: textarea, target: textarea, preventDefault: vi.fn() };
    const data = fakeDataTransfer({ 'text/html': '<b>x</b>' });
    expect(pasteAsMarkdown({ ...base, clipboardData: data, defaultPrevented: true })).toBe(false);
    expect(pasteAsMarkdown({ ...base, clipboardData: null, defaultPrevented: false })).toBe(false);
    const div = document.createElement('div');
    expect(pasteAsMarkdown({ ...base, currentTarget: div, target: div, clipboardData: data, defaultPrevented: false })).toBe(false);
    expect(pasteAsMarkdown({ ...base, currentTarget: null, target: null, clipboardData: data, defaultPrevented: false })).toBe(false);
    const email = document.createElement('input');
    email.type = 'email';
    expect(pasteAsMarkdown({ ...base, currentTarget: email, target: email, clipboardData: data, defaultPrevented: false })).toBe(false);
    const readonly = field('<textarea readonly></textarea>');
    expect(pasteAsMarkdown({ ...base, currentTarget: readonly, target: readonly, clipboardData: data, defaultPrevented: false })).toBe(false);
    expect(base.preventDefault).not.toHaveBeenCalled();
  });

  it('finds the field from the event target when the handler sits on a container', () => {
    vi.spyOn(document, 'execCommand').mockReturnValue(false);
    const input = field('<input type="search">');
    const preventDefault = vi.fn();
    const handled = pasteAsMarkdown(
      { currentTarget: document.body, target: input, clipboardData: fakeDataTransfer({ 'text/html': '<i>it</i>' }), defaultPrevented: false, preventDefault },
      { links: 'text' },
    );
    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(input.value).toBe('*it*');
  });

  it('invalid options never break the native paste', () => {
    const textarea = field('<textarea></textarea>');
    const preventDefault = vi.fn();
    expect(
      pasteAsMarkdown(
        { currentTarget: textarea, target: textarea, clipboardData: fakeDataTransfer({ 'text/html': '<b>x</b>' }), defaultPrevented: false, preventDefault },
        { maxDepth: -1 },
      ),
    ).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
