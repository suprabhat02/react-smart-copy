import { act, fireEvent, render } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useOtpField, type UseOtpFieldOptions, type UseOtpFieldResult } from '../../src';

let latest: UseOtpFieldResult | undefined;

function Code(props: UseOtpFieldOptions & { readonly boxes?: number }) {
  const { boxes, ...options } = props;
  const otp = useOtpField(options);
  latest = otp;
  return (
    <div role="group" aria-label="Verification code">
      {Array.from({ length: boxes ?? options.length ?? 6 }, (_, index) => (
        <input key={index} data-testid={`box-${String(index)}`} {...otp.getInputProps(index)} />
      ))}
      <output>{otp.complete ? `done ${otp.value}` : otp.value}</output>
    </div>
  );
}

const inputsOf = (container: HTMLElement): HTMLInputElement[] => Array.from(container.querySelectorAll('input'));
const values = (container: HTMLElement): string => inputsOf(container).map((input) => input.value || '.').join('');

describe('useOtpField', () => {
  it('renders boxes ready for codes on the server, without touching the DOM', () => {
    const html = renderToString(<Code length={4} />);
    // React writes the attributes' JSX names during server rendering; browsers read them case-insensitively.
    expect(html).toMatch(/autocomplete="one-time-code"/i);
    expect(html).toMatch(/inputmode="numeric"/i);
    expect(html).toContain('aria-label="Digit 4 of 4"');
    expect(html).toContain('pattern="[0-9]*"');
    expect(html).not.toContain('Digit 5');
  });

  it('types, autofills and pastes, and reports the code', () => {
    const onComplete = vi.fn();
    const { container } = render(
      <StrictMode>
        <Code onComplete={onComplete} />
      </StrictMode>,
    );
    const inputs = inputsOf(container);
    fireEvent.input(inputs[0] as HTMLInputElement, { target: { value: '4' } });
    expect(values(container)).toBe('4.....');
    expect(document.activeElement).toBe(inputs[1]);
    expect(container.querySelector('output')?.textContent).toBe('4');

    fireEvent.input(inputs[0] as HTMLInputElement, { target: { value: '482913' } });
    expect(values(container)).toBe('482913');
    expect(container.querySelector('output')?.textContent).toBe('done 482913');
    expect(onComplete).toHaveBeenCalledTimes(1);

    act(() => {
      latest?.clear();
    });
    expect(values(container)).toBe('......');
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => 'Your code is 123456' } });
    act(() => {
      inputs[2]?.dispatchEvent(event);
    });
    expect(values(container)).toBe('123456');
    expect(onComplete).toHaveBeenLastCalledWith('123456');
  });

  it('calls the latest callbacks and labels', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { container, rerender } = render(<Code length={2} onComplete={first} />);
    rerender(<Code length={2} onComplete={second} label={(index) => `Box ${String(index + 1)}`} />);
    expect(inputsOf(container)[1]?.getAttribute('aria-label')).toBe('Box 2');
    act(() => {
      latest?.setValue('42');
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('42');
    const onChange = vi.fn();
    rerender(<Code length={2} onChange={onChange} />);
    act(() => {
      latest?.setValue('17');
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ value: '17' }));
  });

  it('makes a new, empty field when the length or alphabet changes', () => {
    const { container, rerender } = render(<Code length={4} />);
    act(() => {
      latest?.setValue('4829');
    });
    rerender(<Code length={6} />);
    expect(values(container)).toBe('......');
    expect(inputsOf(container)[5]?.getAttribute('aria-label')).toBe('Digit 6 of 6');
    act(() => {
      latest?.setValue('482913');
    });
    expect(values(container)).toBe('482913');
    rerender(<Code length={6} alphabet="alphanumeric" />);
    expect(inputsOf(container)[0]?.getAttribute('aria-label')).toBe('Character 1 of 6');
    expect(inputsOf(container)[0]?.getAttribute('inputmode')).toBe('text');
    expect(inputsOf(container)[0]?.hasAttribute('pattern')).toBe(false);
  });

  it('waits until every box is rendered, and follows boxes that are replaced', () => {
    function Toggle() {
      const [shown, setShown] = useState(2);
      const [key, setKey] = useState(0);
      const otp = useOtpField({ length: 3 });
      latest = otp;
      return (
        <div>
          {Array.from({ length: shown }, (_, index) => (
            <input key={`${String(key)}-${String(index)}`} {...otp.getInputProps(index)} />
          ))}
          <button type="button" onClick={() => { setShown(3); }}>
            all
          </button>
          <button type="button" onClick={() => { setKey((value) => value + 1); }}>
            replace
          </button>
        </div>
      );
    }
    const { container, getByText } = render(<Toggle />);
    // Two of three boxes: nothing is attached yet.
    expect(inputsOf(container)[0]?.hasAttribute('aria-label')).toBe(true);
    fireEvent.input(inputsOf(container)[0] as HTMLInputElement, { target: { value: '4' } });
    expect(latest?.value).toBe('');
    fireEvent.click(getByText('all'));
    fireEvent.input(inputsOf(container)[0] as HTMLInputElement, { target: { value: '4' } });
    expect(latest?.value).toBe('4');
    fireEvent.click(getByText('replace'));
    expect(inputsOf(container)[0]?.value).toBe('4');
    fireEvent.input(inputsOf(container)[1] as HTMLInputElement, { target: { value: '8' } });
    expect(latest?.value).toBe('48');
  });

  it('detaches on unmount, and asks for an index it has no box for safely', () => {
    const onChange = vi.fn();
    const { container, unmount } = render(<Code length={2} onChange={onChange} />);
    const inputs = inputsOf(container);
    const props = latest?.getInputProps(9);
    expect(props?.['aria-label']).toBe('Digit 10 of 2');
    props?.ref(null);
    unmount();
    fireEvent.input(inputs[0] as HTMLInputElement, { target: { value: '4' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps focus() and setValue stable across renders', () => {
    const { rerender } = render(<Code length={2} />);
    const before = latest;
    rerender(<Code length={2} />);
    expect(latest?.focus).toBe(before?.focus);
    expect(latest?.setValue).toBe(before?.setValue);
    expect(latest?.getInputProps).toBe(before?.getInputProps);
    act(() => {
      latest?.focus();
    });
  });
});
