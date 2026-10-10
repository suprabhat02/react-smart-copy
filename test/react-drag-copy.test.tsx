import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDragCopy, type UseDragCopyOptions } from '../src/react/useDragCopy';
import type { DragCopyState } from '../src/core/drag-copy';

/* ─────────────────────────────────────────────────────────────── helpers */

interface FakeTransfer {
  effectAllowed: string;
  readonly data: Map<string, string>;
  setData(format: string, value: string): void;
  clearData?(): void;
}

function fakeTransfer(): FakeTransfer {
  const data = new Map<string, string>();
  return {
    effectAllowed: 'uninitialized',
    data,
    setData(format, value) {
      data.set(format, value);
    },
  };
}

function dispatchDragStart(target: HTMLElement, transfer = fakeTransfer()) {
  const event = new Event('dragstart', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: transfer });
  target.dispatchEvent(event);
  return { event, transfer };
}

function dispatchDragEnd(target: HTMLElement) {
  target.dispatchEvent(new Event('dragend', { bubbles: true }));
}

function DragBox(props: UseDragCopyOptions & { readonly label?: string }) {
  const { label = 'drag', ...options } = props;
  const { ref, status, outcome } = useDragCopy(options);
  return (
    <div ref={ref} data-status={status} data-outcome={outcome?.status ?? 'none'}>
      {label}
    </div>
  );
}

afterEach(() => {
  document.body.innerHTML = '';
});

/* ─────────────────────────────────────────────────────────── useDragCopy */

describe('useDragCopy', () => {
  it('sets draggable on the ref element', () => {
    const { container } = render(<DragBox source={() => 'hello'} />);
    expect(container.querySelector('div')?.getAttribute('draggable')).toBe('true');
  });

  it('writes text/plain and updates status to dragging', () => {
    const { container } = render(<DragBox source={() => 'payload'} />);
    const div = container.querySelector('div') as HTMLElement;
    let transfer!: ReturnType<typeof fakeTransfer>;
    act(() => { ({ transfer } = dispatchDragStart(div)); });
    expect(transfer.data.get('text/plain')).toBe('payload');
    expect(div.dataset['status']).toBe('dragging');
    expect(div.dataset['outcome']).toBe('written');
  });

  it('writes html + text/plain', () => {
    const { container } = render(
      <DragBox source={() => ({ kind: 'html', html: '<b>drag</b>', text: 'drag' })} />,
    );
    const div = container.querySelector('div') as HTMLElement;
    const { transfer } = dispatchDragStart(div);
    expect(transfer.data.get('text/html')).toBe('<b>drag</b>');
    expect(transfer.data.get('text/plain')).toBe('drag');
  });

  it('status becomes done after dragend', () => {
    const { container } = render(<DragBox source={() => 'x'} />);
    const div = container.querySelector('div') as HTMLElement;
    dispatchDragStart(div);
    act(() => { dispatchDragEnd(div); });
    expect(div.dataset['status']).toBe('done');
  });

  it('starts as idle and stays idle before any drag', () => {
    const { container } = render(<DragBox source={() => 'x'} />);
    expect(container.querySelector('div')?.dataset['status']).toBe('idle');
    expect(container.querySelector('div')?.dataset['outcome']).toBe('none');
  });

  it('uses latest source without re-subscribing', () => {
    const add = vi.spyOn(document.body, 'addEventListener');
    let value = 'v1';
    const { container, rerender } = render(<DragBox source={() => value} />);
    const div = container.querySelector('div') as HTMLElement;

    expect(dispatchDragStart(div).transfer.data.get('text/plain')).toBe('v1');
    const subscriptions = add.mock.calls.length;
    value = 'v2';
    rerender(<DragBox source={() => value} />);
    expect(dispatchDragStart(div).transfer.data.get('text/plain')).toBe('v2');
    // No additional listeners attached for the element.
    expect(add.mock.calls.length).toBe(subscriptions);
  });

  it('stops dragging and resets status to idle when disabled', () => {
    const { container, rerender } = render(<DragBox source={() => 'x'} enabled={false} />);
    const div = container.querySelector('div') as HTMLElement;
    expect(div.getAttribute('draggable')).toBeNull();
    expect(div.dataset['status']).toBe('idle');

    rerender(<DragBox source={() => 'x'} />);
    expect(div.getAttribute('draggable')).toBe('true');
    act(() => { dispatchDragStart(div); });
    expect(div.dataset['status']).toBe('dragging');

    rerender(<DragBox source={() => 'x'} enabled={false} />);
    expect(div.getAttribute('draggable')).toBeNull();
    expect(div.dataset['status']).toBe('idle');
  });

  it('prevents drag but does not write when source returns false', () => {
    const { container } = render(<DragBox source={() => false} />);
    const div = container.querySelector('div') as HTMLElement;
    const event = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: fakeTransfer() });
    act(() => { div.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(div.dataset['outcome']).toBe('passed');
  });

  it('calls onDrag with dragging and then done', () => {
    const states: DragCopyState[] = [];
    const { container } = render(
      <DragBox source={() => 'drag-data'} onDrag={(s) => states.push(s)} />,
    );
    const div = container.querySelector('div') as HTMLElement;
    dispatchDragStart(div);
    act(() => { dispatchDragEnd(div); });
    expect(states[0]?.status).toBe('dragging');
    expect(states[1]?.status).toBe('done');
  });

  it('calls onError when the source produces an invalid payload', () => {
    const onError = vi.fn();
    const { container } = render(
      <DragBox source={() => ''} onError={onError} />,
    );
    const div = container.querySelector('div') as HTMLElement;
    dispatchDragStart(div);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ type: 'invalid-payload' }));
  });

  it('does not call onError on a successful drag', () => {
    const onError = vi.fn();
    const { container } = render(<DragBox source={() => 'fine'} onError={onError} />);
    dispatchDragStart(container.querySelector('div') as HTMLElement);
    expect(onError).not.toHaveBeenCalled();
  });

  it('follows ref when the element changes', () => {
    function Switcher() {
      const [which, setWhich] = useState<'a' | 'b'>('a');
      const { ref } = useDragCopy<HTMLSpanElement>({ source: () => 'moved' });
      return (
        <>
          <span id="a" ref={which === 'a' ? ref : undefined}>A</span>
          <span id="b" ref={which === 'b' ? ref : undefined}>B</span>
          <button type="button" onClick={() => { setWhich('b'); }}>switch</button>
        </>
      );
    }
    const { container, getByText } = render(<Switcher />);
    const a = container.querySelector('#a') as HTMLElement;
    const b = container.querySelector('#b') as HTMLElement;

    act(() => { getByText('switch').click(); });

    // Old element: draggable removed, no data written.
    expect(a.getAttribute('draggable')).toBeNull();
    const { transfer: tA } = dispatchDragStart(a);
    expect(tA.data.size).toBe(0);

    // New element: draggable set, data written.
    expect(b.getAttribute('draggable')).toBe('true');
    const { transfer: tB } = dispatchDragStart(b);
    expect(tB.data.get('text/plain')).toBe('moved');
  });

  it('removes draggable on unmount', () => {
    const { container, unmount } = render(<DragBox source={() => 'x'} />);
    const div = container.querySelector('div') as HTMLElement;
    expect(div.getAttribute('draggable')).toBe('true');
    unmount();
    expect(div.getAttribute('draggable')).toBeNull();
  });

  it('onDragStart prop writes to the DataTransfer', () => {
    function WithHandler() {
      const { ref, onDragStart } = useDragCopy({ source: () => 'from-prop' });
      return (
        <div
          ref={ref}
          onDragStart={(e) => {
            onDragStart({
              type: 'dragstart',
              dataTransfer: e.dataTransfer,
              defaultPrevented: e.defaultPrevented,
              preventDefault: () => { e.preventDefault(); },
            });
          }}
        >
          handler
        </div>
      );
    }
    const { container } = render(<WithHandler />);
    const div = container.querySelector('div') as HTMLElement;
    const transfer = fakeTransfer();
    const event = new Event('dragstart', { bubbles: true });
    Object.defineProperty(event, 'dataTransfer', { value: transfer });
    Object.defineProperty(event, 'defaultPrevented', { value: false });
    div.dispatchEvent(event);
    expect(transfer.data.get('text/plain')).toBe('from-prop');
  });

  it('sets effectAllowed to move when configured', () => {
    const { container } = render(<DragBox source={() => 'x'} effectAllowed="move" />);
    const div = container.querySelector('div') as HTMLElement;
    const { transfer } = dispatchDragStart(div);
    expect(transfer.effectAllowed).toBe('move');
  });

  it('onDragStart prop calls onError on invalid payload', () => {
    const onError = vi.fn();
    function WithErrorHandler() {
      const { ref, onDragStart } = useDragCopy({ source: () => '' as unknown as string, onError });
      return (
        <div
          ref={ref}
          onDragStart={(e) => {
            onDragStart({
              type: 'dragstart',
              dataTransfer: e.dataTransfer,
              defaultPrevented: e.defaultPrevented,
              preventDefault: () => { e.preventDefault(); },
            });
          }}
        >
          handler
        </div>
      );
    }
    const { container } = render(<WithErrorHandler />);
    const div = container.querySelector('div') as HTMLElement;
    const event = new Event('dragstart', { bubbles: true });
    Object.defineProperty(event, 'dataTransfer', { value: fakeTransfer() });
    Object.defineProperty(event, 'defaultPrevented', { value: false });
    div.dispatchEvent(event);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ type: 'invalid-payload' }));
  });

  it('onDragStart prop respects effectAllowed', () => {
    function WithEffectHandler() {
      const { ref, onDragStart } = useDragCopy({ source: () => 'effect-prop', effectAllowed: 'move' });
      return (
        <div
          ref={ref}
          onDragStart={(e) => {
            onDragStart({
              type: 'dragstart',
              dataTransfer: e.dataTransfer,
              defaultPrevented: e.defaultPrevented,
              preventDefault: () => { e.preventDefault(); },
            });
          }}
        >
          handler
        </div>
      );
    }
    const { container } = render(<WithEffectHandler />);
    const div = container.querySelector('div') as HTMLElement;
    const transfer = fakeTransfer();
    const event = new Event('dragstart', { bubbles: true });
    Object.defineProperty(event, 'dataTransfer', { value: transfer });
    Object.defineProperty(event, 'defaultPrevented', { value: false });
    act(() => { div.dispatchEvent(event); });
    expect(transfer.data.get('text/plain')).toBe('effect-prop');
    expect(transfer.effectAllowed).toBe('move');
  });
});
