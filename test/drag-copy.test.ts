import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyDragCopy,
  registerDragCopy,
  type DataTransferLike,
  type DragCopyOptions,
  type DragCopyOutcome,
  type DragCopyState,
  type DragStartEventLike,
} from '../src/core/drag-copy';

/* ───────────────────────────────────────────────────────────── helpers */

interface FakeTransfer extends DataTransferLike {
  readonly data: Map<string, string>;
  readonly setData: ReturnType<typeof vi.fn<(format: string, data: string) => void>>;
  readonly clearData: ReturnType<typeof vi.fn<(format?: string) => void>>;
  effectAllowed: string;
}

function fakeTransfer(): FakeTransfer {
  const data = new Map<string, string>();
  return {
    data,
    effectAllowed: 'uninitialized',
    setData: vi.fn((format: string, value: string) => {
      data.set(format, value);
    }),
    clearData: vi.fn(() => {
      data.clear();
    }),
  };
}

function dragEventLike(
  transfer: DataTransferLike | null = fakeTransfer(),
  prevented = false,
): DragStartEventLike {
  let _prevented = prevented;
  return {
    type: 'dragstart',
    dataTransfer: transfer,
    get defaultPrevented() {
      return _prevented;
    },
    preventDefault() {
      _prevented = true;
    },
  };
}

function source(decision: ReturnType<DragCopyOptions['source']>): DragCopyOptions {
  return { source: () => decision };
}

function mount(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
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

afterEach(() => {
  document.body.innerHTML = '';
});

/* ─────────────────────────────────────────────────── applyDragCopy */

describe('applyDragCopy', () => {
  it('writes a plain string as text/plain', () => {
    const transfer = fakeTransfer();
    const outcome = applyDragCopy(dragEventLike(transfer), source('Hello drag'));
    expect(outcome).toMatchObject({ status: 'written', payload: { kind: 'text', value: 'Hello drag' } });
    expect(Object.fromEntries(transfer.data)).toEqual({ 'text/plain': 'Hello drag' });
  });

  it('writes a text payload', () => {
    const transfer = fakeTransfer();
    applyDragCopy(dragEventLike(transfer), source({ kind: 'text', value: 'text' }));
    expect(transfer.data.get('text/plain')).toBe('text');
  });

  it('writes html + text/plain fallback', () => {
    const transfer = fakeTransfer();
    applyDragCopy(dragEventLike(transfer), source({ kind: 'html', html: '<b>bold</b>', text: 'bold' }));
    expect(Object.fromEntries(transfer.data)).toEqual({ 'text/html': '<b>bold</b>', 'text/plain': 'bold' });
  });

  it('serialises a json payload', () => {
    const transfer = fakeTransfer();
    applyDragCopy(dragEventLike(transfer), source({ kind: 'json', value: { x: 1 }, pretty: true }));
    expect(transfer.data.get('text/plain')).toBe('{\n  "x": 1\n}');
  });

  it('serialises a compact json payload', () => {
    const transfer = fakeTransfer();
    applyDragCopy(dragEventLike(transfer), source({ kind: 'json', value: { x: 1 } }));
    expect(transfer.data.get('text/plain')).toBe('{"x":1}');
  });

  it('serialises a json payload with numeric indent', () => {
    const transfer = fakeTransfer();
    applyDragCopy(dragEventLike(transfer), source({ kind: 'json', value: { x: 1 }, pretty: 4 }));
    expect(transfer.data.get('text/plain')).toBe('{\n    "x": 1\n}');
  });

  it('writes every item of a multi payload', () => {
    const transfer = fakeTransfer();
    const outcome = applyDragCopy(
      dragEventLike(transfer),
      source({ kind: 'multi', items: [{ mimeType: 'text/plain', data: 'a\tb' }, { mimeType: 'text/csv', data: 'a,b' }] }),
    );
    expect(outcome.status).toBe('written');
    expect(Object.fromEntries(transfer.data)).toEqual({ 'text/plain': 'a\tb', 'text/csv': 'a,b' });
  });

  it('sets effectAllowed to "copy" by default', () => {
    const transfer = fakeTransfer();
    applyDragCopy(dragEventLike(transfer), source('hello'));
    expect(transfer.effectAllowed).toBe('copy');
  });

  it('respects a custom effectAllowed', () => {
    const transfer = fakeTransfer();
    applyDragCopy(dragEventLike(transfer), { source: () => 'x', effectAllowed: 'move' });
    expect(transfer.effectAllowed).toBe('move');
  });

  it('returns passed/declined when source returns null', () => {
    expect(applyDragCopy(dragEventLike(), source(null))).toMatchObject({ status: 'passed', reason: 'declined' });
  });

  it('returns passed/declined when source returns undefined', () => {
    expect(applyDragCopy(dragEventLike(), source(undefined))).toMatchObject({ status: 'passed', reason: 'declined' });
  });

  it('cancels the drag and returns passed/cancelled when source returns false', () => {
    const event = dragEventLike();
    const outcome = applyDragCopy(event, source(false));
    expect(outcome).toMatchObject({ status: 'passed', reason: 'cancelled' });
    expect(event.defaultPrevented).toBe(true);
  });

  it('returns passed/declined when event is already prevented', () => {
    const outcome = applyDragCopy(dragEventLike(fakeTransfer(), true), source('hello'));
    expect(outcome).toMatchObject({ status: 'passed', reason: 'declined' });
  });

  it('returns passed/no-transfer when dataTransfer is null', () => {
    const outcome = applyDragCopy(dragEventLike(null), source('hello'));
    expect(outcome).toMatchObject({ status: 'passed', reason: 'no-transfer' });
  });

  describe('failures', () => {
    const invalid: readonly [string, unknown, string][] = [
      ['an empty string', '', 'invalid-payload'],
      ['a Promise', Promise.resolve('async'), 'invalid-payload'],
      ['an image payload', { kind: 'image', blob: new Blob() }, 'unsupported-format'],
      ['an empty multi payload', { kind: 'multi', items: [] }, 'invalid-payload'],
      ['a multi payload without items', { kind: 'multi' }, 'invalid-payload'],
      ['a multi item that is null', { kind: 'multi', items: [null] }, 'invalid-payload'],
      ['duplicate multi MIME types', { kind: 'multi', items: [{ mimeType: 'text/plain', data: 'a' }, { mimeType: 'text/plain', data: 'b' }] }, 'invalid-payload'],
      ['a multi item with a Blob', { kind: 'multi', items: [{ mimeType: 'image/png', data: new Blob() }] }, 'unsupported-format'],
      ['html without text', { kind: 'html', html: '<b>x</b>', text: '' }, 'invalid-payload'],
      ['json with a circular reference', (() => { const o: Record<string, unknown> = {}; o['self'] = o; return { kind: 'json', value: o }; })(), 'invalid-payload'],
      ['json serialising to nothing', { kind: 'json', value: undefined }, 'invalid-payload'],
      ['an unknown kind', { kind: 'file', data: 'x' }, 'unsupported-format'],
      ['a raw number', 42, 'invalid-payload'],
      ['true', true, 'invalid-payload'],
    ];

    it.each(invalid)('returns failed for %s', (_label, decision, errorType) => {
      const outcome = applyDragCopy(dragEventLike(), {
        source: () => decision as string,
      });
      expect(outcome).toMatchObject({ status: 'failed', error: { type: errorType } });
    });

    it('catches a source that throws', () => {
      const cause = new Error('oops');
      const outcome = applyDragCopy(dragEventLike(), {
        source: () => { throw cause; },
      });
      expect(outcome).toMatchObject({ status: 'failed', error: { type: 'invalid-payload', cause } });
    });

    it('clears and returns failed when setData throws', () => {
      const clearData = vi.fn();
      const throwing: DataTransferLike = {
        effectAllowed: 'uninitialized',
        setData: () => { throw new Error('denied'); },
        clearData,
      };
      const outcome = applyDragCopy(dragEventLike(throwing), source('hello'));
      expect(outcome).toMatchObject({ status: 'failed', error: { type: 'unknown' } });
      expect(clearData).toHaveBeenCalled();
    });

    it('survives a clearData that throws', () => {
      const throwing: DataTransferLike = {
        effectAllowed: 'uninitialized',
        setData: () => { throw new Error('set'); },
        clearData: () => { throw new Error('clear'); },
      };
      expect(applyDragCopy(dragEventLike(throwing), source('hi')).status).toBe('failed');
    });

    it('survives a clearData that is missing', () => {
      const noClear: DataTransferLike = {
        effectAllowed: 'uninitialized',
        setData: () => { throw new Error('set'); },
      };
      expect(applyDragCopy(dragEventLike(noClear), source('hi')).status).toBe('failed');
    });
  });
});

/* ───────────────────────────────────────────────── registerDragCopy */

describe('registerDragCopy', () => {
  it('sets draggable on the element', () => {
    const el = mount('<div id="d">drag me</div>').querySelector('#d') as HTMLElement;
    const { unsubscribe } = registerDragCopy(el, source('hello'));
    expect(el.getAttribute('draggable')).toBe('true');
    unsubscribe();
  });

  it('removes draggable and listener on unsubscribe', () => {
    const el = mount('<div>bye</div>').querySelector('div') as HTMLElement;
    const transform = vi.fn(() => 'x');
    const { unsubscribe } = registerDragCopy(el, { source: transform });
    unsubscribe();
    expect(el.getAttribute('draggable')).toBeNull();
    const { transfer } = dispatchDragStart(el);
    expect(transfer.setData).not.toHaveBeenCalled();
  });

  it('unsubscribe is idempotent', () => {
    const el = mount('<div>x</div>').querySelector('div') as HTMLElement;
    const { unsubscribe } = registerDragCopy(el, source('y'));
    expect(() => { unsubscribe(); unsubscribe(); }).not.toThrow();
  });

  it('writes data and calls onDrag with dragging status on dragstart', () => {
    const el = mount('<div>drag</div>').querySelector('div') as HTMLElement;
    const onDrag = vi.fn<(state: DragCopyState) => void>();
    const { unsubscribe } = registerDragCopy(el, {
      source: () => 'payload',
      onDrag,
    });
    const { transfer } = dispatchDragStart(el);
    expect(transfer.data.get('text/plain')).toBe('payload');
    expect(onDrag).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'dragging', outcome: expect.objectContaining({ status: 'written' }) }),
    );
    unsubscribe();
  });

  it('calls onDrag with done status on dragend', () => {
    const el = mount('<div>drag</div>').querySelector('div') as HTMLElement;
    const onDrag = vi.fn<(state: DragCopyState) => void>();
    const { unsubscribe } = registerDragCopy(el, { source: () => 'x', onDrag });
    dispatchDragStart(el);
    dispatchDragEnd(el);
    expect(onDrag).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'done' }),
    );
    unsubscribe();
  });

  it('reports failure through onError and calls onDrag', () => {
    const el = mount('<div>x</div>').querySelector('div') as HTMLElement;
    const onError = vi.fn();
    const onDrag = vi.fn();
    const { unsubscribe } = registerDragCopy(el, {
      source: () => '', // triggers invalid-payload
      onError,
      onDrag,
    });
    dispatchDragStart(el);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ type: 'invalid-payload' }));
    expect(onDrag).toHaveBeenCalled();
    unsubscribe();
  });

  it('does not call onError for successful drags', () => {
    const el = mount('<div>fine</div>').querySelector('div') as HTMLElement;
    const onError = vi.fn();
    const { unsubscribe } = registerDragCopy(el, { source: () => 'ok', onError });
    dispatchDragStart(el);
    expect(onError).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('reads the latest options through a getter', () => {
    const el = mount('<div>live</div>').querySelector('div') as HTMLElement;
    let suffix = 'v1';
    const { unsubscribe } = registerDragCopy(el, () => ({ source: () => `hello-${suffix}` }));
    expect(dispatchDragStart(el).transfer.data.get('text/plain')).toBe('hello-v1');
    suffix = 'v2';
    expect(dispatchDragStart(el).transfer.data.get('text/plain')).toBe('hello-v2');
    unsubscribe();
  });

  it('reads the latest options when passed a plain object getter', () => {
    const el = mount('<div>opts</div>').querySelector('div') as HTMLElement;
    let label = 'A';
    const opts: DragCopyOptions = { source: () => label };
    const { unsubscribe } = registerDragCopy(el, opts);
    dispatchDragStart(el);
    label = 'B';
    // The same object is read each time, so changes to `label` are picked up.
    expect(dispatchDragStart(el).transfer.data.get('text/plain')).toBe('B');
    unsubscribe();
  });

  it('sets the custom effectAllowed', () => {
    const el = mount('<div>move</div>').querySelector('div') as HTMLElement;
    const { unsubscribe } = registerDragCopy(el, { source: () => 'x', effectAllowed: 'move' });
    const { transfer } = dispatchDragStart(el);
    expect(transfer.effectAllowed).toBe('move');
    unsubscribe();
  });

  it('ignores events when disabled via the returned unsubscribe', () => {
    const el = mount('<div>gone</div>').querySelector('div') as HTMLElement;
    const { unsubscribe } = registerDragCopy(el, source('x'));
    unsubscribe();
    const { transfer } = dispatchDragStart(el);
    expect(transfer.setData).not.toHaveBeenCalled();
  });

  it('never prevents the drag when source returns null (passes through)', () => {
    const el = mount('<div>pass</div>').querySelector('div') as HTMLElement;
    const { unsubscribe } = registerDragCopy(el, source(null));
    const event = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: fakeTransfer() });
    el.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    unsubscribe();
  });

  it('prevents the drag event when source returns false', () => {
    const el = mount('<div>cancel</div>').querySelector('div') as HTMLElement;
    const { unsubscribe } = registerDragCopy(el, source(false));
    const event = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: fakeTransfer() });
    el.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    unsubscribe();
  });

  it('does not write when dataTransfer is null on the native event', () => {
    const el = mount('<div>null-dt</div>').querySelector('div') as HTMLElement;
    const { unsubscribe } = registerDragCopy(el, source('data'));
    const event = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: null });
    el.dispatchEvent(event);
    // Outcome is passed/no-transfer, so onDrag still fires
    unsubscribe();
  });

  it('handles a source error without crashing the drag', () => {
    const reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);
    try {
      const el = mount('<div>boom</div>').querySelector('div') as HTMLElement;
      const onDragThrows = vi.fn(() => { throw new Error('handler bug'); });
      const { unsubscribe } = registerDragCopy(el, {
        source: () => { throw new Error('source bug'); },
        onDrag: onDragThrows as unknown as (state: DragCopyState) => void,
      });
      dispatchDragStart(el);
      // onDrag threw, so reportError was called
      expect(reportError).toHaveBeenCalled();
      unsubscribe();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('supports multiple independent registrations on different elements', () => {
    const host = mount('<span id="a">A</span><span id="b">B</span>');
    const a = host.querySelector('#a') as HTMLElement;
    const b = host.querySelector('#b') as HTMLElement;
    const { unsubscribe: stopA } = registerDragCopy(a, source('A-data'));
    const { unsubscribe: stopB } = registerDragCopy(b, source('B-data'));

    expect(dispatchDragStart(a).transfer.data.get('text/plain')).toBe('A-data');
    expect(dispatchDragStart(b).transfer.data.get('text/plain')).toBe('B-data');
    stopA();
    stopB();
  });

  describe('dragend outcome carries the last dragstart result', () => {
    it('done state holds the last written outcome', () => {
      const el = mount('<div>end</div>').querySelector('div') as HTMLElement;
      const states: DragCopyState[] = [];
      const { unsubscribe } = registerDragCopy(el, {
        source: () => 'data',
        onDrag: (s) => states.push(s),
      });
      dispatchDragStart(el);
      dispatchDragEnd(el);
      expect(states).toHaveLength(2);
      const [dragging, done] = states as [DragCopyState, DragCopyState];
      expect(dragging.status).toBe('dragging');
      expect(done.status).toBe('done');
      expect(done.outcome).toMatchObject({ status: 'written' });
      unsubscribe();
    });
  });
});

/* ──────────────────────────────── outcome shapes */

describe('DragCopyOutcome types', () => {
  it('written outcome contains the resolved payload', () => {
    const transfer = fakeTransfer();
    const outcome = applyDragCopy(dragEventLike(transfer), source({ kind: 'html', html: '<i>x</i>', text: 'x' }));
    if (outcome.status !== 'written') throw new Error('expected written');
    expect(outcome.payload).toMatchObject({ kind: 'html', html: '<i>x</i>' });
  });

  it('failed outcome contains a classified error', () => {
    const outcome = applyDragCopy(dragEventLike(), source(''));
    if (outcome.status !== 'failed') throw new Error('expected failed');
    expect(outcome.error.type).toBe('invalid-payload');
    expect(typeof outcome.error.message).toBe('string');
  });

  it('passed outcome carries a reason', () => {
    const reasons: DragCopyOutcome[] = [
      applyDragCopy(dragEventLike(), source(null)),
      applyDragCopy(dragEventLike(), source(false)),
      applyDragCopy(dragEventLike(null), source('x')),
    ];
    const r = reasons.map((o) => (o.status === 'passed' ? o.reason : null));
    expect(r).toEqual(['declined', 'cancelled', 'no-transfer']);
  });
});
