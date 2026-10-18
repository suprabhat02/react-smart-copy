import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { insertText as markdownInsertText } from '../../src/markdown';
import { DEFAULT_CODE_MAX_LENGTH, insertText, pasteAsCode, pasteToCode, type PasteAsCodeOptions } from '../../src/code';
import { fakeDataTransfer } from '../fixtures';
import { VS_CODE, VS_CODE_TEXT } from '../markdown/fixtures';

const typed = (type: string): unknown => expect.objectContaining({ copyError: expect.objectContaining({ type }) });

// jsdom has no execCommand (insertText falls back without it): define one the tests can spy on.
beforeEach(() => {
  Object.defineProperty(document, 'execCommand', { value: () => false, configurable: true, writable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'execCommand');
  document.body.innerHTML = '';
});

describe('pasteToCode', () => {
  it('cleans what a chat app or word processor did to the code, and reports it', () => {
    const result = pasteToCode({ text: 'const s = \u201Chi\u201D;\u00A0\u200B\r\n', html: '<p>ignored</p>' });
    expect(result).toEqual({
      code: 'const s = "hi";',
      source: 'text',
      findings: expect.arrayContaining([expect.objectContaining({ kind: 'confusable-punctuation' })]) as unknown,
      fixed: 4,
      remaining: [],
      danger: false,
    });
    expect(result?.findings).toHaveLength(4);
  });

  it('removes Trojan Source controls but reports them', () => {
    const result = pasteToCode({ text: 'if (role != "user\u202E \u2066// admin\u2069 \u2066") {' });
    expect(result?.code).toBe('if (role != "user // admin ") {');
    expect(result?.findings.filter((finding) => finding.severity === 'danger')).toHaveLength(4);
    expect(result?.danger).toBe(false);
  });

  it('reports what stays dangerous when cleaning is limited or off', () => {
    const off = pasteToCode({ text: 'if (\u0430dmin) {}' }, { clean: false });
    expect(off).toMatchObject({ code: 'if (\u0430dmin) {}', fixed: 0, danger: true, remaining: [expect.objectContaining({ index: 4, replacement: 'a' })] });
    expect(pasteToCode({ text: '\u0430b\u201C' }, { clean: ['confusable-punctuation'] })).toMatchObject({ code: '\u0430b"', danger: true });
    expect(pasteToCode({ text: 'p\u043Bint' })).toMatchObject({ danger: false, remaining: [expect.objectContaining({ severity: 'warning', replacement: null })] });
  });

  it('dedents and indents every line after the first', () => {
    expect(pasteToCode({ text: '    if (a) {\n      b();\n\n    }' }, { indent: '\t' })?.code).toBe('if (a) {\n\t  b();\n\n\t}');
    expect(pasteToCode({ text: '  x\n  y' }, { dedent: false, indent: '  ' })?.code).toBe('  x\n    y');
  });

  it('keeps prompts unless asked, and takes the other text options', () => {
    expect(pasteToCode({ text: '$ ls\nout' })?.code).toBe('$ ls\nout');
    expect(pasteToCode({ text: '$ ls\nout' }, { prompt: 'auto' })?.code).toBe('ls');
    expect(pasteToCode({ text: 'a\nb' }, { lineEnding: 'crlf' })?.code).toBe('a\r\nb');
  });

  it('reads the code from the HTML when that is all there is', () => {
    expect(pasteToCode({ text: '', html: VS_CODE })).toMatchObject({ code: VS_CODE_TEXT, source: 'html', fixed: 1 });
    expect(pasteToCode({ html: '<pre>a<button>Copy</button></pre>' })).toMatchObject({ code: 'a', source: 'html' });
  });

  it('returns null when there is nothing to paste', () => {
    expect(pasteToCode({})).toBeNull();
    expect(pasteToCode({ text: null, html: null })).toBeNull();
    expect(pasteToCode({ text: '  \n ' })).toBeNull();
    expect(pasteToCode({ html: '   ' })).toBeNull();
    expect(pasteToCode({ html: '<img src="x.png">' })).toBeNull();
  });

  it('never cuts code: pastes past maxLength are a too-large error', () => {
    expect(() => pasteToCode({ text: 'abcd' }, { maxLength: 3 })).toThrow(typed('too-large'));
    expect(() => pasteToCode({ html: '<pre>abcd</pre>' }, { maxLength: 8 })).toThrow(typed('too-large'));
    expect(pasteToCode({ text: 'abc' }, { maxLength: 3 })?.code).toBe('abc');
    expect(DEFAULT_CODE_MAX_LENGTH).toBe(2_000_000);
  });

  it('rejects invalid options with a typed error', () => {
    expect(() => pasteToCode({ text: 'x' }, { indent: 'x' })).toThrow(typed('invalid-payload'));
    expect(() => pasteToCode({ text: 'x' }, { indent: 2 as never })).toThrow(typed('invalid-payload'));
    expect(() => pasteToCode({ text: 'x' }, { maxLength: -1 })).toThrow(typed('invalid-payload'));
  });

  it('shares insertText with react-smart-copy/markdown', () => {
    expect(insertText).toBe(markdownInsertText);
  });
});

function field(html: string): HTMLInputElement & HTMLTextAreaElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLInputElement & HTMLTextAreaElement;
}

function paste(target: HTMLElement, data: Record<string, string>, options?: PasteAsCodeOptions) {
  const preventDefault = vi.fn();
  const handled = pasteAsCode({ currentTarget: target, target, clipboardData: fakeDataTransfer(data), defaultPrevented: false, preventDefault }, options);
  return { handled, prevented: preventDefault.mock.calls.length > 0 };
}

describe('pasteAsCode', () => {
  function Editor({ options }: { readonly options?: PasteAsCodeOptions }) {
    const [value, setValue] = useState('function f() {\n  ');
    return (
      <>
        <textarea
          aria-label="code"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
          onPaste={(event) => pasteAsCode(event, options)}
        />
        <output>{value}</output>
      </>
    );
  }

  it('React: pastes cleaned code indented to the cursor line, and the controlled state follows', () => {
    render(<Editor />);
    const editor = screen.getByLabelText<HTMLTextAreaElement>('code');
    editor.setSelectionRange(editor.value.length, editor.value.length);
    const notPrevented = fireEvent.paste(editor, { clipboardData: fakeDataTransfer({ 'text/plain': '    if (\u201Cx\u201D) {\n      go();\n    }' }) });
    expect(notPrevented).toBe(false);
    expect(screen.getByRole('status').textContent).toBe('function f() {\n  if ("x") {\n    go();\n  }');
  });

  it('keeps the browser undo: execCommand inserts when it can', () => {
    const textarea = field('<textarea></textarea>');
    const exec = vi.spyOn(document, 'execCommand').mockReturnValue(true);
    expect(paste(textarea, { 'text/plain': 'x\u200B' })).toEqual({ handled: true, prevented: true });
    expect(exec).toHaveBeenCalledWith('insertText', false, 'x');
  });

  it('indents to the whitespace of the cursor line, even mid-line', () => {
    const textarea = field('<textarea></textarea>');
    textarea.value = 'a\n\t\tcall(';
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    paste(textarea, { 'text/plain': 'x,\ny' });
    expect(textarea.value).toBe('a\n\t\tcall(x,\n\t\ty');
  });

  it('can leave indentation alone', () => {
    const textarea = field('<textarea></textarea>');
    textarea.value = '    ';
    textarea.setSelectionRange(4, 4);
    paste(textarea, { 'text/plain': 'a\nb' }, { indentToCursor: false });
    expect(textarea.value).toBe('    a\nb');
  });

  it('pastes into a field with no selection API as it is', () => {
    const textarea = field('<textarea></textarea>');
    Object.defineProperty(textarea, 'selectionStart', { get: () => null, configurable: true });
    Object.defineProperty(textarea, 'selectionEnd', { get: () => null, configurable: true });
    textarea.value = '  ';
    paste(textarea, { 'text/plain': 'a\nb' });
    expect(textarea.value).toBe('  a\nb');
  });

  it('puts a one-line command into a text input', () => {
    const input = field('<input type="text">');
    expect(paste(input, { 'text/plain': '$ npm i\nout' }, { prompt: 'auto' }).handled).toBe(true);
    expect(input.value).toBe('npm i');
  });

  it('lets onPaste see the result and cancel the paste', () => {
    const textarea = field('<textarea></textarea>');
    const onPaste = vi.fn(() => false);
    expect(paste(textarea, { 'text/plain': 'if (\u0430dmin) {}' }, { clean: false, onPaste })).toEqual({ handled: true, prevented: true });
    expect(onPaste).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
    expect(textarea.value).toBe('');
    const allow = vi.fn();
    paste(textarea, { 'text/plain': 'ok' }, { onPaste: allow });
    expect(allow).toHaveBeenCalledOnce();
    expect(textarea.value).toBe('ok');
  });

  it('reads code from the HTML flavour when there is no text', () => {
    const textarea = field('<textarea></textarea>');
    paste(textarea, { 'text/html': '<pre>x<span aria-hidden="true">1</span></pre>' });
    expect(textarea.value).toBe('x');
  });

  it('leaves the paste to the browser when it cannot or should not handle it', () => {
    const data = fakeDataTransfer({ 'text/plain': 'x' });
    const preventDefault = vi.fn();
    const textarea = field('<textarea></textarea>');
    const base = { currentTarget: textarea, target: textarea, preventDefault };
    expect(pasteAsCode({ ...base, clipboardData: data, defaultPrevented: true })).toBe(false);
    expect(pasteAsCode({ ...base, clipboardData: null, defaultPrevented: false })).toBe(false);
    expect(pasteAsCode({ ...base, clipboardData: fakeDataTransfer({}), defaultPrevented: false })).toBe(false);
    expect(pasteAsCode({ ...base, clipboardData: data, defaultPrevented: false }, { maxLength: 0 })).toBe(false);
    expect(pasteAsCode({ ...base, clipboardData: fakeDataTransfer({ 'text/plain': 'long' }), defaultPrevented: false }, { maxLength: 2 })).toBe(false);
    const div = document.createElement('div');
    expect(pasteAsCode({ ...base, currentTarget: div, target: div, clipboardData: data, defaultPrevented: false })).toBe(false);
    const disabled = field('<textarea disabled></textarea>');
    expect(pasteAsCode({ ...base, currentTarget: disabled, target: disabled, clipboardData: data, defaultPrevented: false })).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('does not hide unexpected errors', () => {
    const textarea = field('<textarea></textarea>');
    const clipboardData = {
      getData: () => {
        throw new TypeError('boom');
      },
    };
    expect(() => pasteAsCode({ currentTarget: textarea, target: textarea, clipboardData, defaultPrevented: false, preventDefault: vi.fn() })).toThrow(TypeError);
  });
});
