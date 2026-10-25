import { afterEach, describe, expect, it, vi } from 'vitest';
import { pasteAddresses, type AddressList, type AddressPasteEvent, type PasteAddressesOptions } from '../../src/email';

afterEach(() => {
  document.body.replaceChildren();
});

function field(html: string): HTMLInputElement {
  document.body.innerHTML = html;
  const element = document.body.firstElementChild as HTMLInputElement;
  element.focus();
  return element;
}

function paste(target: EventTarget, text: string | null, options: Partial<PasteAddressesOptions> = {}) {
  const lists: AddressList[] = [];
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: text === null ? null : { getData: (type: string) => (type === 'text/plain' ? text : '') } });
  let outcome: string | undefined;
  target.addEventListener('paste', (pasted) => {
    outcome = pasteAddresses(pasted as unknown as AddressPasteEvent, { onAddresses: (list) => lists.push(list), ...options });
  }, { once: true });
  target.dispatchEvent(event);
  return { outcome, prevented: event.defaultPrevented, lists };
}

describe('pasteAddresses', () => {
  it('reads a pasted list, and keeps what was not an address in the field', () => {
    const input = field('<input type="text" />');
    const result = paste(input, 'Lima, Ana <ana@example.com>; nobody; bo@example');
    expect(result.outcome).toBe('parsed');
    expect(result.prevented).toBe(true);
    expect(result.lists[0]?.addresses.map((one) => one.address)).toEqual(['ana@example.com']);
    expect(input.value).toBe('nobody, bo@example');
  });

  it('leaves the field alone when everything was an address, or when asked to', () => {
    const input = field('<textarea></textarea>');
    expect(paste(input, 'ana@example.com').outcome).toBe('parsed');
    expect(input.value).toBe('');
    expect(paste(input, 'oops@, ana@example.com', { keepInvalid: false }).lists[0]?.invalid).toHaveLength(1);
    expect(input.value).toBe('');
  });

  it('passes options on, and reads full-width @', () => {
    const input = field('<input type="email" multiple />');
    const result = paste(input, 'ana\uFF20example.com, bo@example.org', { domains: ['example.com'] });
    expect(result.lists[0]?.addresses.map((one) => one.address)).toEqual(['ana@example.com']);
    expect(result.lists[0]?.invalid[0]?.reason).toBe('not-allowed');
    // An email input has no text to insert into: the invalid entry is only reported.
    expect(input.value).toBe('');
  });

  it('leaves names, empty pastes and handled pastes to the browser', () => {
    const onAddresses = vi.fn();
    expect(paste(field('<input type="text" />'), 'Ana Lima', { onAddresses })).toMatchObject({ outcome: 'ignored', prevented: false });
    expect(paste(field('<input type="text" />'), '', { onAddresses }).outcome).toBe('ignored');
    expect(paste(field('<input type="text" />'), null, { onAddresses }).outcome).toBe('ignored');
    const input = field('<input type="text" />');
    input.addEventListener('paste', (event) => {
      event.preventDefault();
    });
    expect(paste(input, 'ana@example.com', { onAddresses }).outcome).toBe('ignored');
    expect(onAddresses).not.toHaveBeenCalled();
  });

  it('finds the field from the target when the handler is on a parent', () => {
    document.body.innerHTML = '<div><input type="text" /></div>';
    const input = document.querySelector('input') as HTMLInputElement;
    input.focus();
    const wrapper = input.parentElement as HTMLElement;
    wrapper.addEventListener('paste', (event) => {
      pasteAddresses(event, { onAddresses: () => undefined });
    });
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => 'oops@ ana@example.com' } });
    input.dispatchEvent(event);
    expect(input.value).toBe('oops@ ana@example.com');
  });
});
