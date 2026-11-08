/**
 * Copy interceptors and web components: selections and fields inside shadow roots, as each
 * engine reports them. Chromium and Firefox give the selection's own range (or a folded,
 * collapsed one plus `getComposedRanges`); Safari folds it onto the host and only
 * `getComposedRanges` sees inside.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { interceptCopyEvent, registerCopyInterceptor, type ClipboardDataLike } from '../src/core';

function fakeClipboard() {
  const data = new Map<string, string>();
  return { data, setData: (format: string, value: string) => data.set(format, value), getData: (format: string) => data.get(format) ?? '' };
}

function dispatchCopy(target: EventTarget) {
  const clipboard = fakeClipboard();
  // `composed`, like the browser's: it crosses shadow boundaries, retargeted to each host.
  const event = new Event('copy', { bubbles: true, cancelable: true, composed: true });
  Object.defineProperty(event, 'clipboardData', { value: clipboard });
  target.dispatchEvent(event);
  return { event, text: clipboard.data.get('text/plain') };
}

/** A page section holding a web component, with nested open shadow roots. */
function component() {
  const wrapper = document.createElement('section');
  const card = document.createElement('x-card');
  wrapper.append(document.createTextNode('Light text '), card);
  document.body.append(wrapper);
  const outer = card.attachShadow({ mode: 'open' });
  outer.innerHTML = '<p id="para">Inside the card</p><input id="key" value="sk-live-0123456789abcdef"><x-row id="row"></x-row><p id="blank">   </p>';
  const row = outer.getElementById('row') as HTMLElement;
  const nested = row.attachShadow({ mode: 'open' });
  nested.innerHTML = '<span id="deep">Two levels down</span>';
  return { wrapper, card, outer, row, nested };
}

/** A minimal StaticRange. */
const at = (startContainer: Node, startOffset: number, endContainer: Node, endOffset: number) =>
  ({ startContainer, startOffset, endContainer, endOffset, collapsed: false }) as unknown as StaticRange;

/**
 * A selection as Safari reports one inside a component: folded to a collapsed range at the
 * host, with `getComposedRanges` answering for the shadow roots it is given.
 */
function foldedSelection(folded: Range, reveal: (roots: readonly ShadowRoot[]) => StaticRange[], text: string): Selection {
  return {
    isCollapsed: true,
    rangeCount: 1,
    getRangeAt: () => folded,
    removeAllRanges: () => undefined,
    getComposedRanges: ({ shadowRoots }: { shadowRoots: ShadowRoot[] }) => reveal(shadowRoots),
    toString: () => text,
  } as unknown as Selection;
}

function collapsedAt(node: Node, offset: number): Range {
  const range = document.createRange();
  range.setStart(node, offset);
  return range;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  document.getSelection()?.removeAllRanges();
});

describe('fields inside a web component', () => {
  it('a scope around the component redacts its input, through the retargeted event', () => {
    const { wrapper, outer } = component();
    const stop = registerCopyInterceptor(wrapper, { transform: ({ text }) => (text.startsWith('sk-live') ? '[redacted]' : text) });
    const field = outer.getElementById('key') as HTMLInputElement;
    field.setSelectionRange(0, field.value.length);
    const { event, text } = dispatchCopy(field);
    expect(event.defaultPrevented).toBe(true);
    expect(text).toBe('[redacted]');
    stop();
  });

  it('a scope elsewhere leaves it alone', () => {
    const { outer } = component();
    const elsewhere = document.createElement('aside');
    document.body.append(elsewhere);
    const transform = vi.fn(() => 'no');
    const stop = registerCopyInterceptor(elsewhere, { transform });
    const field = outer.getElementById('key') as HTMLInputElement;
    field.setSelectionRange(0, 3);
    expect(dispatchCopy(field).event.defaultPrevented).toBe(false);
    expect(transform).not.toHaveBeenCalled();
    stop();
  });

  it('an event object without composedPath falls back to its target', () => {
    const { outer } = component();
    const field = outer.getElementById('key') as HTMLInputElement;
    field.setSelectionRange(0, 7);
    const clipboard = fakeClipboard() as unknown as ClipboardDataLike;
    const outcome = interceptCopyEvent(
      { type: 'copy', target: field, clipboardData: clipboard, defaultPrevented: false, preventDefault: () => undefined },
      { transform: ({ text }) => text.toUpperCase() },
    );
    expect(outcome).toMatchObject({ status: 'written', selection: { text: 'sk-live' } });
  });
});

describe('text selected inside a web component (Chromium, Firefox: the range itself)', () => {
  it('a scope around the component handles it, and one elsewhere does not', () => {
    const { wrapper, outer } = component();
    const elsewhere = document.createElement('aside');
    document.body.append(elsewhere);
    const other = vi.fn(() => 'other');
    const stopOther = registerCopyInterceptor(elsewhere, { priority: 10, transform: other });
    const stop = registerCopyInterceptor(wrapper, { transform: ({ text }) => `${text} (app)` });
    const range = document.createRange();
    range.selectNodeContents(outer.getElementById('para') as Node);
    vi.spyOn(document, 'getSelection').mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
      removeAllRanges: () => undefined,
      toString: () => 'Inside the card',
    } as unknown as Selection);
    expect(dispatchCopy(outer.getElementById('para') as Element).text).toBe('Inside the card (app)');
    expect(other).not.toHaveBeenCalled();
    stopOther();
    stop();
  });

  it('a selection of only blank space inside the component does not count', () => {
    const { wrapper, outer } = component();
    const transform = vi.fn(() => 'x');
    const stop = registerCopyInterceptor(wrapper, { transform });
    const range = document.createRange();
    range.selectNodeContents(outer.getElementById('blank') as Node);
    vi.spyOn(document, 'getSelection').mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
      removeAllRanges: () => undefined,
      toString: () => '   ',
    } as unknown as Selection);
    dispatchCopy(outer.getElementById('blank') as Element);
    expect(transform).not.toHaveBeenCalled();
    stop();
  });
});

describe('text selected inside a web component (Safari, and Chromium mouse selections: folded)', () => {
  it('reveals the selection one shadow root at a time, two levels down', () => {
    const { wrapper, card, outer, row, nested } = component();
    const stop = registerCopyInterceptor(wrapper, { transform: ({ text }) => `${text} (app)` });
    const deep = (nested.getElementById('deep') as Element).firstChild as Text;
    const asked: number[] = [];
    vi.spyOn(document, 'getSelection').mockReturnValue(
      foldedSelection(
        collapsedAt(wrapper, 1),
        (roots) => {
          asked.push(roots.length);
          if (roots.includes(nested)) return [at(deep, 0, deep, deep.data.length)];
          // Folded onto the next host down: the boundaries around it.
          const host = roots.includes(outer) ? row : card;
          const parent = host.parentNode as Node;
          const index = [...parent.childNodes].indexOf(host);
          return [at(parent, index, parent, index + 1)];
        },
        'Two levels down',
      ),
    );
    expect(dispatchCopy(wrapper).text).toBe('Two levels down (app)');
    // Read twice per copy (to pick the scope, then to hand it the selection), three steps each.
    expect(asked).toEqual([0, 1, 2, 0, 1, 2]);
    stop();
  });

  it('finds the host at the end boundary too', () => {
    const { wrapper, outer } = component();
    const stop = registerCopyInterceptor(wrapper, { transform: ({ text }) => `${text}!` });
    const para = (outer.getElementById('para') as Element).firstChild as Text;
    vi.spyOn(document, 'getSelection').mockReturnValue(
      foldedSelection(
        collapsedAt(wrapper, 1),
        // Starts on the light text before the card (not a host), ends after the card.
        (roots) => (roots.includes(outer) ? [at(para, 0, para, 6)] : [at(wrapper, 0, wrapper, 2)]),
        'Inside',
      ),
    );
    expect(dispatchCopy(wrapper).text).toBe('Inside!');
    stop();
  });

  it('keeps the folded selection for one that crosses into a component, which no single Range can hold', () => {
    const { wrapper, outer } = component();
    const transform = vi.fn(() => 'x');
    const stop = registerCopyInterceptor(wrapper, { transform });
    const light = wrapper.firstChild as Text;
    const para = (outer.getElementById('para') as Element).firstChild as Text;
    vi.spyOn(document, 'getSelection').mockReturnValue(
      foldedSelection(collapsedAt(wrapper, 1), (roots) => (roots.includes(outer) ? [at(light, 0, para, 6)] : [at(wrapper, 1, wrapper, 2)]), 'Light text Inside'),
    );
    // The folded range is collapsed: nothing the interceptor can read, so the browser copies as usual.
    expect(dispatchCopy(wrapper).event.defaultPrevented).toBe(false);
    expect(transform).not.toHaveBeenCalled();
    stop();
  });

  it('stops on a host it has already revealed, and after eight levels', () => {
    const { wrapper } = component();
    const stop = registerCopyInterceptor(wrapper, { transform: () => 'x' });
    // A browser that keeps pointing at the same host.
    const same = vi.fn(() => [at(wrapper, 1, wrapper, 2)]);
    vi.spyOn(document, 'getSelection').mockReturnValue(foldedSelection(collapsedAt(wrapper, 1), same, 'Light'));
    dispatchCopy(wrapper);
    // Two steps, then it stops; the folded range selects nothing, so no scope is matched.
    expect(same).toHaveBeenCalledTimes(2);

    // Endless nesting: a new host every time.
    vi.restoreAllMocks();
    const deep = vi.fn((_roots: readonly ShadowRoot[]) => {
      const host = document.createElement('x-deep');
      host.attachShadow({ mode: 'open' });
      const parent = document.createElement('div');
      parent.append(host);
      return [at(parent, 0, parent, 1)];
    });
    vi.spyOn(document, 'getSelection').mockReturnValue(foldedSelection(collapsedAt(wrapper, 1), deep, 'x'));
    dispatchCopy(wrapper);
    // Eight steps and no more; what it ends on is outside the scope, so nothing is read again.
    expect(deep).toHaveBeenCalledTimes(8);
    stop();
  });

  it('handles a browser that returns no composed range, or no selection range at all', () => {
    const { wrapper } = component();
    const transform = vi.fn(() => 'x');
    const stop = registerCopyInterceptor(wrapper, { transform });
    vi.spyOn(document, 'getSelection').mockReturnValue(foldedSelection(collapsedAt(wrapper, 1), () => [], ''));
    expect(dispatchCopy(wrapper).event.defaultPrevented).toBe(false);
    vi.restoreAllMocks();
    vi.spyOn(document, 'getSelection').mockReturnValue({
      isCollapsed: true,
      rangeCount: 0,
      getRangeAt: () => {
        throw new Error('no range');
      },
      removeAllRanges: () => undefined,
      toString: () => '',
    } as unknown as Selection);
    expect(dispatchCopy(wrapper).event.defaultPrevented).toBe(false);
    expect(transform).not.toHaveBeenCalled();
    stop();
  });
});
