import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CopyInterceptOutcome } from '../src/core/copy-interceptor';
import { useCopyInterceptor, type UseCopyInterceptorOptions } from '../src/react/useCopyInterceptor';

function dispatchCopy(target: EventTarget, type: 'copy' | 'cut' = 'copy') {
  const data = new Map<string, string>();
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { setData: (format: string, value: string) => data.set(format, value) },
  });
  target.dispatchEvent(event);
  return { event, data };
}

function selectContents(node: Node): void {
  const range = document.createRange();
  range.selectNodeContents(node);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);
}

function Article(props: UseCopyInterceptorOptions & { readonly text?: string }) {
  const { text = 'Install with npm', ...options } = props;
  const { ref } = useCopyInterceptor(options);
  return <article ref={ref}>{text}</article>;
}

afterEach(() => {
  document.getSelection()?.removeAllRanges();
});

describe('useCopyInterceptor', () => {
  it('rewrites native copies inside the referenced element', () => {
    const onIntercept = vi.fn<(outcome: CopyInterceptOutcome) => void>();
    const { container } = render(<Article transform={({ text }) => `${text}\n— docs.acme.dev`} onIntercept={onIntercept} />);
    const article = container.querySelector('article') as HTMLElement;
    selectContents(article);

    const { event, data } = dispatchCopy(article);
    expect(data.get('text/plain')).toBe('Install with npm\n— docs.acme.dev');
    expect(event.defaultPrevented).toBe(true);
    expect(onIntercept.mock.calls[0]?.[0].status).toBe('written');
  });

  it('always uses the latest transform without re-subscribing', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const { container, rerender } = render(<Article transform={() => 'first'} />);
    const article = container.querySelector('article') as HTMLElement;
    selectContents(article);
    expect(dispatchCopy(article).data.get('text/plain')).toBe('first');

    const subscriptions = add.mock.calls.length;
    rerender(<Article transform={() => 'second'} />);
    expect(dispatchCopy(article).data.get('text/plain')).toBe('second');
    expect(add.mock.calls.length).toBe(subscriptions);
  });

  it('stops intercepting while disabled and resumes when re-enabled', () => {
    const { container, rerender } = render(<Article enabled={false} transform={() => 'x'} />);
    const article = container.querySelector('article') as HTMLElement;
    selectContents(article);
    expect(dispatchCopy(article).event.defaultPrevented).toBe(false);

    rerender(<Article enabled transform={() => 'x'} />);
    expect(dispatchCopy(article).data.get('text/plain')).toBe('x');
  });

  it('unsubscribes on unmount', () => {
    const transform = vi.fn(() => 'x');
    const { container, unmount } = render(<Article transform={transform} />);
    const article = container.querySelector('article') as HTMLElement;
    unmount();
    document.body.appendChild(article);
    selectContents(article);
    expect(dispatchCopy(article).event.defaultPrevented).toBe(false);
    expect(transform).not.toHaveBeenCalled();
    article.remove();
  });

  it('follows the ref when it moves to another element', () => {
    function Switcher() {
      const [which, setWhich] = useState<'a' | 'b'>('a');
      const { ref } = useCopyInterceptor<HTMLParagraphElement>({ transform: () => 'scoped' });
      return (
        <>
          <p id="a" ref={which === 'a' ? ref : undefined}>A</p>
          <p id="b" ref={which === 'b' ? ref : undefined}>B</p>
          <button type="button" onClick={() => { setWhich('b'); }}>move</button>
        </>
      );
    }
    const { container, getByText } = render(<Switcher />);
    const a = container.querySelector('#a') as HTMLElement;
    const b = container.querySelector('#b') as HTMLElement;

    act(() => {
      getByText('move').click();
    });
    selectContents(a);
    expect(dispatchCopy(a).event.defaultPrevented).toBe(false);
    selectContents(b);
    expect(dispatchCopy(b).data.get('text/plain')).toBe('scoped');
  });

  it('blocks copying and leaves content in place on cut', () => {
    const { container } = render(<Article events={['cut']} transform={() => false} text="no-copy zone" />);
    const article = container.querySelector('article') as HTMLElement;
    selectContents(article);
    expect(dispatchCopy(article, 'copy').event.defaultPrevented).toBe(false);
    const { event, data } = dispatchCopy(article, 'cut');
    expect(event.defaultPrevented).toBe(true);
    expect(data.size).toBe(0);
    expect(article.textContent).toBe('no-copy zone');
  });

  it('lets a React onCopy handler that prevents default take precedence', () => {
    const transform = vi.fn(() => 'x');
    function WithHandler() {
      const { ref } = useCopyInterceptor<HTMLDivElement>({ transform });
      return (
        <div
          ref={ref}
          onCopy={(event) => {
            event.preventDefault();
          }}
        >
          handled
        </div>
      );
    }
    const { container } = render(<WithHandler />);
    const div = container.querySelector('div') as HTMLElement;
    selectContents(div);
    dispatchCopy(div);
    expect(transform).not.toHaveBeenCalled();
  });
});
