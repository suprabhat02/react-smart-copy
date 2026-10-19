import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyFailure } from '../../src/core/errors';
import { colorPayload, pasteAsColor, readColor, type ColorPasteEvent } from '../../src/color';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('colorPayload', () => {
  it('copies the value, with a swatch for rich-text apps', () => {
    expect(colorPayload('#3B82F6')).toEqual({
      kind: 'html',
      html: '<span style="display:inline-block;width:0.9em;height:0.9em;vertical-align:-0.1em;border:1px solid rgba(0,0,0,0.25);border-radius:2px;background:#3b82f6"></span>&nbsp;<code>#3b82f6</code>',
      text: '#3b82f6',
    });
    expect(colorPayload('#3b82f6', { format: 'oklch' })).toMatchObject({ text: 'oklch(62.31% 0.18801 259.81)' });
    expect(colorPayload('rgb(0 0 0 / 50%)', { format: 'rgb', legacy: true, swatch: false })).toEqual({ kind: 'text', value: 'rgba(0, 0, 0, 0.5)' });
  });

  it('draws the swatch in sRGB, whatever the format', () => {
    const payload = colorPayload('color(display-p3 1 0 0)', { format: 'p3' });
    expect(payload).toMatchObject({ text: 'color(display-p3 1 0 0)' });
    expect((payload as { html: string }).html).toContain('background:#ff0b0c');
  });

  it('rejects what is not a colour or an option, with a typed error', () => {
    expect(() => colorPayload('blurple')).toThrow(CopyFailure);
    expect(() => colorPayload('red', { swatch: 'yes' as never })).toThrow(CopyFailure);
    expect(() => colorPayload('red', { format: 'cmyk' as never })).toThrow(CopyFailure);
  });
});

describe('readColor', () => {
  it('reads one colour from pasted text, also as a declaration', () => {
    expect(readColor('  rgb(59, 130, 246)  ')).toMatchObject({ alpha: 1 });
    for (const text of ['color: #3b82f6;', 'background-color:#3b82f6 !important;', '--brand-500: #3b82f6', 'border-color : #3b82f6 ;']) {
      expect(readColor(text), text).toEqual(readColor('#3b82f6'));
    }
    expect(readColor({ text: 'oklch(70% 0.1 200)' })).not.toBeNull();
  });

  it('returns null for anything else, never throwing', () => {
    for (const text of ['', 'not a colour', 'red blue', 'color: red; background: blue;', '3b82f6', 'decade', 'x'.repeat(600)]) expect(readColor(text), text).toBeNull();
    expect(readColor({ text: null })).toBeNull();
    expect(readColor({})).toBeNull();
  });

  it('reads bare hex only when asked', () => {
    expect(readColor('3b82f6', { bareHex: true })).toEqual(readColor('#3b82f6'));
    expect(readColor('fff', { bareHex: true })).toEqual(readColor('#fff'));
    expect(readColor('ffffff80', { bareHex: true })).toEqual(readColor('#ffffff80'));
    expect(readColor('ffff', { bareHex: true })).toBeNull();
    expect(readColor('beige', { bareHex: true })).toEqual(readColor('#f5f5dc'));
  });
});

function field(value: string, text: string | null, tag: 'input' | 'div' = 'input') {
  const element = document.createElement(tag);
  document.body.append(element);
  if (element instanceof HTMLInputElement) {
    element.value = value;
    element.setSelectionRange(0, value.length);
  }
  const preventDefault = vi.fn();
  const event: ColorPasteEvent = {
    clipboardData: text === null ? null : { getData: (format) => (format === 'text/plain' ? text : '') },
    currentTarget: element,
    target: element,
    defaultPrevented: false,
    preventDefault,
  };
  return { element: element as HTMLInputElement, event, preventDefault };
}

describe('pasteAsColor', () => {
  it('pastes any colour in the field format', () => {
    const hex = field('#000000', 'rgb(59 130 246)');
    expect(pasteAsColor(hex.event)).toBe(true);
    expect(hex.element.value).toBe('#3b82f6');
    expect(hex.preventDefault).toHaveBeenCalledOnce();
    const oklch = field('', 'background: #3b82f6;');
    expect(pasteAsColor(oklch.event, { format: 'oklch', precision: 1 })).toBe(true);
    expect(oklch.element.value).toBe('oklch(62.3% 0.2 259.8)');
    const bare = field('', '3b82f6');
    expect(pasteAsColor(bare.event, { bareHex: true })).toBe(true);
    expect(bare.element.value).toBe('#3b82f6');
  });

  it('leaves everything else to the browser', () => {
    const cases = [field('', 'not a colour'), field('', null), field('', '#fff', 'div'), field('', '3b82f6')];
    for (const { event, preventDefault } of cases) {
      expect(pasteAsColor(event)).toBe(false);
      expect(preventDefault).not.toHaveBeenCalled();
    }
    const handled = field('', '#fff');
    expect(pasteAsColor({ ...handled.event, defaultPrevented: true })).toBe(false);
    const disabled = field('', '#fff');
    disabled.element.disabled = true;
    expect(pasteAsColor(disabled.event)).toBe(false);
    const declined = field('', '#fff');
    const onColor = vi.fn(() => false);
    expect(pasteAsColor(declined.event, { onColor })).toBe(false);
    expect(onColor).toHaveBeenCalledWith(expect.objectContaining({ r: 1, g: 1, b: 1 }));
    const accepted = field('', '#fff');
    expect(pasteAsColor({ ...accepted.event, currentTarget: document.body }, { onColor: () => undefined })).toBe(true);
    expect(accepted.element.value).toBe('#ffffff');
  });

  it('throws for invalid options before touching the paste', () => {
    const { event, preventDefault } = field('', '#fff');
    expect(() => pasteAsColor(event, { format: 'cmyk' as never })).toThrow(CopyFailure);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
