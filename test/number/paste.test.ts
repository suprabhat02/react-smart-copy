import { afterEach, describe, expect, it, vi } from 'vitest';
import { pasteAsNumber, type NumberPasteEvent, type PasteAsNumberOptions } from '../../src/number';

afterEach(() => {
  document.body.replaceChildren();
});

function field(html: string): HTMLInputElement | HTMLTextAreaElement {
  document.body.innerHTML = html;
  const element = document.body.firstElementChild as HTMLInputElement;
  element.focus();
  return element;
}

/** A paste of `text` on `target`, through `pasteAsNumber`. */
function paste(target: EventTarget, text: string | null, options?: PasteAsNumberOptions) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: text === null ? null : { getData: (type: string) => (type === 'text/plain' ? text : '') } });
  let outcome: ReturnType<typeof pasteAsNumber> | undefined;
  target.addEventListener('paste', (pasted) => {
    outcome = pasteAsNumber(pasted as unknown as NumberPasteEvent, options);
  }, { once: true });
  target.dispatchEvent(event);
  return { outcome, prevented: event.defaultPrevented };
}

describe('pasteAsNumber', () => {
  it('writes the exact number into a number input', () => {
    const input = field('<input type="number" />') as HTMLInputElement;
    const onInput = vi.fn();
    input.addEventListener('input', onInput);
    const onNumber = vi.fn();
    expect(paste(input, '1.234,50 \u20AC', { locale: 'de-DE', onNumber })).toEqual({ outcome: 'pasted', prevented: true });
    expect(input.value).toBe('1234.50');
    expect(onInput).toHaveBeenCalledTimes(1);
    expect(onNumber).toHaveBeenCalledWith(expect.objectContaining({ exact: '1234.50', currency: { symbol: '\u20AC', code: 'EUR' } }));
    // A number input holds one number: a paste replaces it.
    expect(paste(input, '(42)').outcome).toBe('pasted');
    expect(input.value).toBe('-42');
  });

  it('writes the number in the locale\'s format into a text field, at the cursor', () => {
    const input = field('<input type="text" inputmode="decimal" value="Total: " />') as HTMLInputElement;
    input.setSelectionRange(7, 7);
    expect(paste(input, '$1,234.5', { locale: 'de-DE' }).outcome).toBe('pasted');
    expect(input.value).toBe('Total: 1234,5');
    const area = field('<textarea></textarea>');
    expect(paste(area, '  12,34,567  ').outcome).toBe('pasted');
    expect(area.value).toBe('1234567');
  });

  it('writes what format returns', () => {
    const input = field('<input type="number" />');
    expect(paste(input, '12%', { format: (parsed) => String(parsed.value / 100) }).outcome).toBe('pasted');
    expect(input.value).toBe('0.12');
  });

  it('turns away a paste that is not a number, and tells onReject', () => {
    const input = field('<input type="number" value="5" />');
    const onReject = vi.fn();
    expect(paste(input, 'call me at 555-0102', { onReject })).toEqual({ outcome: 'rejected', prevented: true });
    expect(input.value).toBe('5');
    expect(onReject).toHaveBeenCalledWith('call me at 555-0102');
    expect(paste(input, '-5', { negative: false, onReject }).outcome).toBe('rejected');
    expect(paste(input, '1.5', { fraction: false }).outcome).toBe('rejected');
  });

  it('turns away a paste into a field that takes no input', () => {
    const onReject = vi.fn();
    expect(paste(field('<input type="number" disabled />'), '5', { onReject }).outcome).toBe('rejected');
    expect(paste(field('<input type="text" readonly />'), '5', { onReject }).outcome).toBe('rejected');
    expect(onReject).toHaveBeenCalledTimes(2);
  });

  it('turns away a paste a full text field has no room for', () => {
    const input = field('<input type="text" />') as HTMLInputElement;
    // Insertion that does not happen: the field's own insertion reports it.
    Object.defineProperty(input, 'readOnly', { get: vi.fn().mockReturnValueOnce(false).mockReturnValue(true) });
    expect(paste(input, '5').outcome).toBe('rejected');
    const number = field('<input type="number" />') as HTMLInputElement;
    Object.defineProperty(number, 'disabled', { get: vi.fn().mockReturnValueOnce(false).mockReturnValue(true) });
    expect(paste(number, '5').outcome).toBe('rejected');
  });

  it('leaves other pastes to the browser', () => {
    expect(paste(field('<input type="text" />'), null)).toEqual({ outcome: 'ignored', prevented: false });
    expect(paste(field('<input type="text" />'), '')).toEqual({ outcome: 'ignored', prevented: false });
    expect(paste(field('<input type="email" />'), '5')).toEqual({ outcome: 'ignored', prevented: false });
    expect(paste(field('<div contenteditable="true"></div>'), '5')).toEqual({ outcome: 'ignored', prevented: false });
    const input = field('<input type="number" />');
    input.addEventListener('paste', (event) => {
      event.preventDefault();
    });
    expect(paste(input, '5').outcome).toBe('ignored');
  });

  it('finds the field from the target when the handler is on a parent', () => {
    for (const html of ['<input type="number" />', '<textarea></textarea>']) {
      document.body.innerHTML = `<form>${html}</form>`;
      const form = document.querySelector('form') as HTMLFormElement;
      const target = form.firstElementChild as HTMLInputElement;
      target.focus();
      let outcome: string | undefined;
      form.addEventListener('paste', (event) => {
        outcome = pasteAsNumber(event);
      });
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: { getData: () => '7' } });
      target.dispatchEvent(event);
      expect(outcome, html).toBe('pasted');
      expect(target.value, html).toBe('7');
    }
  });
});
