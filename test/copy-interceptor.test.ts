import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_INTERCEPTED_EVENTS,
  interceptCopyEvent,
  readCopySelection,
  registerCopyInterceptor,
  type ClipboardDataLike,
  type CopyEventLike,
  type CopyInterceptOptions,
  type CopyInterceptOutcome,
  type CopySelection,
} from '../src/core/copy-interceptor';

/* ───────────────────────────────────────────────────────────── helpers */

interface FakeClipboard extends ClipboardDataLike {
  readonly data: Map<string, string>;
  readonly setData: ReturnType<typeof vi.fn<(format: string, data: string) => void>>;
  readonly clearData: ReturnType<typeof vi.fn<(format?: string) => void>>;
}

function fakeClipboard(): FakeClipboard {
  const data = new Map<string, string>();
  return {
    data,
    setData: vi.fn((format: string, value: string) => {
      data.set(format, value);
    }),
    clearData: vi.fn(() => {
      data.clear();
    }),
  };
}

type TestEvent = CopyEventLike & { readonly clipboardData: ClipboardDataLike | null };

function eventLike(type: string, target: EventTarget | null, clipboardData: ClipboardDataLike | null = fakeClipboard()): TestEvent {
  let prevented = false;
  return {
    type,
    target,
    clipboardData,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault() {
      prevented = true;
    },
  };
}

/** Dispatches a real, cancelable copy/cut event carrying `clipboardData`. */
function dispatchCopy(target: EventTarget, type: 'copy' | 'cut' = 'copy', clipboard = fakeClipboard()) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: clipboard });
  target.dispatchEvent(event);
  return { event, clipboard };
}

function mount(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

function selectContents(node: Node): void {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function selectInField(field: HTMLInputElement | HTMLTextAreaElement, start: number, end: number): void {
  field.focus();
  field.setSelectionRange(start, end);
}

function fakeSelection(ranges: readonly Range[], text = ranges.map(String).join('\n')): Selection {
  return {
    isCollapsed: false,
    rangeCount: ranges.length,
    getRangeAt: (index: number) => ranges[index] as Range,
    removeAllRanges: () => undefined,
    toString: () => text,
  } as unknown as Selection;
}

const write = (decision: ReturnType<CopyInterceptOptions['transform']>): CopyInterceptOptions => ({ transform: () => decision });

afterEach(() => {
  document.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
});

/* ───────────────────────────────────────────────────── readCopySelection */

describe('readCopySelection', () => {
  it('reads text, html and a detached fragment from a document selection', () => {
    const host = mount('<p id="p">Hello <b>world</b></p>');
    const p = host.querySelector('#p') as HTMLElement;
    selectContents(p);

    const selection = readCopySelection(eventLike('copy', p));
    expect(selection).toMatchObject({ kind: 'copy', text: 'Hello world', html: 'Hello <b>world</b>', field: null, editable: false });
    // The fragment is a clone: mutating it never touches the page.
    selection?.fragment?.querySelector('b')?.remove();
    expect(p.innerHTML).toBe('Hello <b>world</b>');
  });

  it('reports cut events as kind "cut"', () => {
    const host = mount('<p>cut me</p>');
    selectContents(host);
    expect(readCopySelection(eventLike('cut', host))?.kind).toBe('cut');
  });

  it('marks contenteditable selections as editable', () => {
    const host = mount('<div id="e">edit</div>');
    const editor = host.querySelector('#e') as HTMLElement;
    Object.defineProperty(editor, 'isContentEditable', { value: true });
    selectContents(editor.firstChild as Text);
    expect(readCopySelection(eventLike('copy', editor))?.editable).toBe(true);
  });

  it('treats a selection whose start has no parent element as non-editable', () => {
    const text = document.createTextNode('detached');
    document.createDocumentFragment().appendChild(text);
    const range = document.createRange();
    range.selectNodeContents(text);
    vi.spyOn(document, 'getSelection').mockReturnValue(fakeSelection([range]));
    const selection = readCopySelection(eventLike('copy', document));
    expect(selection).toMatchObject({ text: 'detached', editable: false });
  });

  it('collects html from every range of a multi-range selection (Firefox)', () => {
    const host = mount('<p id="a">one</p><p id="b">two</p>');
    const ranges = ['#a', '#b'].map((id) => {
      const range = document.createRange();
      range.selectNodeContents(host.querySelector(id) as Node);
      return range;
    });
    vi.spyOn(document, 'getSelection').mockReturnValue(fakeSelection(ranges));
    const selection = readCopySelection(eventLike('copy', host));
    expect(selection?.text).toBe('one\ntwo');
    expect(selection?.html).toBe('onetwo');
  });

  it('takes text from the Selection (rendered layout), not the raw Range', () => {
    // Regression: Range#toString leaked source indentation into copies in real browsers.
    const host = mount('<p id="p">Hello\n            world</p>');
    const range = document.createRange();
    range.selectNodeContents(host.querySelector('#p') as Node);
    vi.spyOn(document, 'getSelection').mockReturnValue(fakeSelection([range], 'Hello world'));
    const selection = readCopySelection(eventLike('copy', host));
    expect(selection?.text).toBe('Hello world');
    expect(selection?.html).toBe('Hello\n            world');
  });

  it('returns null for a non-collapsed selection without ranges', () => {
    vi.spyOn(document, 'getSelection').mockReturnValue(fakeSelection([]));
    expect(readCopySelection(eventLike('copy', mount('<p>x</p>')))).toBeNull();
  });

  it('returns null for collapsed, missing or empty selections', () => {
    const host = mount('<p>x</p><span id="empty"><br></span>');
    expect(readCopySelection(eventLike('copy', host))).toBeNull();

    selectContents(host.querySelector('#empty') as Node);
    expect(readCopySelection(eventLike('copy', host))).toBeNull();

    vi.spyOn(document, 'getSelection').mockReturnValue(null);
    expect(readCopySelection(eventLike('copy', host))).toBeNull();
  });

  it('falls back to the global document for non-node targets, and to nothing without one', () => {
    const host = mount('<p>global</p>');
    selectContents(host);
    expect(readCopySelection(eventLike('copy', null))?.text).toBe('global');

    vi.stubGlobal('document', undefined);
    try {
      expect(readCopySelection(eventLike('copy', null))).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reads the selected slice of an input or textarea', () => {
    const host = mount('<input id="i" value="secret-token" /><textarea id="t">line one</textarea>');
    const input = host.querySelector('#i') as HTMLInputElement;
    selectInField(input, 0, 6);
    expect(readCopySelection(eventLike('copy', input))).toMatchObject({ text: 'secret', html: null, fragment: null, field: input, editable: true });

    const textarea = host.querySelector('#t') as HTMLTextAreaElement;
    selectInField(textarea, 5, 8);
    expect(readCopySelection(eventLike('cut', textarea))).toMatchObject({ kind: 'cut', text: 'one', field: textarea });
  });

  it('marks read-only and disabled fields as not editable', () => {
    const host = mount('<input id="r" readonly value="read" /><input id="d" disabled value="dis" />');
    const readOnly = host.querySelector('#r') as HTMLInputElement;
    selectInField(readOnly, 0, 4);
    expect(readCopySelection(eventLike('copy', readOnly))?.editable).toBe(false);

    const disabled = host.querySelector('#d') as HTMLInputElement;
    disabled.setSelectionRange(0, 3);
    expect(readCopySelection(eventLike('copy', disabled))?.editable).toBe(false);
  });

  it('returns null for an empty field selection', () => {
    const host = mount('<input id="i" value="abc" />');
    const input = host.querySelector('#i') as HTMLInputElement;
    selectInField(input, 1, 1);
    expect(readCopySelection(eventLike('copy', input))).toBeNull();
  });

  it('ignores fields without text selection (e.g. type=email) and engines that throw', () => {
    const host = mount('<input id="e" type="email" value="a@b.c" /><input id="x" value="boom" />');
    const email = host.querySelector('#e') as HTMLInputElement;
    expect(readCopySelection(eventLike('copy', email))).toBeNull();

    const throwing = host.querySelector('#x') as HTMLInputElement;
    Object.defineProperty(throwing, 'selectionStart', {
      get: () => {
        throw new DOMException('InvalidStateError');
      },
    });
    expect(readCopySelection(eventLike('copy', throwing))).toBeNull();
  });

  it('does not treat non-field elements or text nodes as fields', () => {
    const host = mount('<p>plain</p>');
    selectContents(host);
    expect(readCopySelection(eventLike('copy', host.querySelector('p')?.firstChild ?? null))?.field).toBeNull();
  });
});

/* ───────────────────────────────────────────────────── interceptCopyEvent */

describe('interceptCopyEvent', () => {
  function selected(type: 'copy' | 'cut' = 'copy', clipboard: ClipboardDataLike | null = fakeClipboard()) {
    const host = mount('<p>Hello world</p>');
    selectContents(host);
    return eventLike(type, host, clipboard);
  }

  it('passes non copy/cut events', () => {
    expect(interceptCopyEvent(eventLike('paste', null), write('x'))).toEqual({ status: 'passed', reason: 'unsupported-event', selection: null });
  });

  it('passes events another handler already handled', () => {
    const event = selected();
    event.preventDefault();
    const transform = vi.fn();
    expect(interceptCopyEvent(event, { transform })).toMatchObject({ status: 'passed', reason: 'already-handled' });
    expect(transform).not.toHaveBeenCalled();
  });

  it('passes when nothing is selected', () => {
    const transform = vi.fn();
    expect(interceptCopyEvent(eventLike('copy', mount('<p>x</p>')), { transform })).toMatchObject({ status: 'passed', reason: 'no-selection' });
    expect(transform).not.toHaveBeenCalled();
  });

  it.each([null, undefined])('leaves the native copy alone when the transform returns %s', (decision) => {
    const event = selected();
    const outcome = interceptCopyEvent(event, write(decision));
    expect(outcome).toMatchObject({ status: 'passed', reason: 'declined' });
    expect(outcome.selection?.text).toBe('Hello world');
    expect(event.defaultPrevented).toBe(false);
  });

  it('writes a string as text/plain and cancels the native copy', () => {
    const clipboard = fakeClipboard();
    const event = selected('copy', clipboard);
    const outcome = interceptCopyEvent(event, { transform: ({ text }) => `${text} (via docs)` });
    expect(outcome).toMatchObject({ status: 'written', payload: { kind: 'text', value: 'Hello world (via docs)' }, deleted: false });
    expect(Object.fromEntries(clipboard.data)).toEqual({ 'text/plain': 'Hello world (via docs)' });
    expect(event.defaultPrevented).toBe(true);
  });

  it('writes html with its plain-text fallback', () => {
    const clipboard = fakeClipboard();
    interceptCopyEvent(selected('copy', clipboard), write({ kind: 'html', html: '<b>x</b>', text: 'x' }));
    expect(Object.fromEntries(clipboard.data)).toEqual({ 'text/html': '<b>x</b>', 'text/plain': 'x' });
  });

  it('serialises json payloads', () => {
    const clipboard = fakeClipboard();
    interceptCopyEvent(selected('copy', clipboard), write({ kind: 'json', value: { a: 1 }, pretty: true }));
    expect(clipboard.data.get('text/plain')).toBe('{\n  "a": 1\n}');
    interceptCopyEvent(selected('copy', clipboard), write({ kind: 'json', value: { a: 1 }, pretty: 4 }));
    expect(clipboard.data.get('text/plain')).toBe('{\n    "a": 1\n}');
    interceptCopyEvent(selected('copy', clipboard), write({ kind: 'json', value: { a: 1 } }));
    expect(clipboard.data.get('text/plain')).toBe('{"a":1}');
  });

  it('writes every string item of a multi payload', () => {
    const clipboard = fakeClipboard();
    const outcome = interceptCopyEvent(
      selected('copy', clipboard),
      write({ kind: 'multi', items: [{ mimeType: 'text/plain', data: 'a\tb' }, { mimeType: 'text/csv', data: 'a,b' }] }),
    );
    expect(outcome.status).toBe('written');
    expect(Object.fromEntries(clipboard.data)).toEqual({ 'text/plain': 'a\tb', 'text/csv': 'a,b' });
  });

  it('blocks the copy when the transform returns false', () => {
    const clipboard = fakeClipboard();
    const event = selected('copy', clipboard);
    expect(interceptCopyEvent(event, write(false))).toMatchObject({ status: 'blocked' });
    expect(event.defaultPrevented).toBe(true);
    expect(clipboard.setData).not.toHaveBeenCalled();
  });

  describe('failures', () => {
    const unwritable: readonly [string, unknown, string][] = [
      ['an empty string', '', 'invalid-payload'],
      ['a promise', Promise.resolve('late'), 'invalid-payload'],
      ['an image payload', { kind: 'image', blob: new Blob() }, 'unsupported-format'],
      ['a multi payload with a Blob', { kind: 'multi', items: [{ mimeType: 'image/png', data: new Blob() }] }, 'unsupported-format'],
      ['an unserialisable json value', { kind: 'json', value: 1n }, 'invalid-payload'],
      ['json that serialises to nothing', { kind: 'json', value: () => 1 }, 'invalid-payload'],
      ['html without a text fallback', { kind: 'html', html: '<b>x</b>', text: '' }, 'invalid-payload'],
      ['an empty multi payload', { kind: 'multi', items: [] }, 'invalid-payload'],
      ['a multi payload without items', { kind: 'multi' }, 'invalid-payload'],
      ['a multi item that is null', { kind: 'multi', items: [null] }, 'invalid-payload'],
      ['duplicate multi MIME types', { kind: 'multi', items: [{ mimeType: 'text/plain', data: 'a' }, { mimeType: 'text/plain', data: 'b' }] }, 'invalid-payload'],
      ['true', true, 'invalid-payload'],
      ['a number', 42, 'invalid-payload'],
    ];

    it.each(unwritable)('fails closed on %s by default', (_label, decision, type) => {
      const clipboard = fakeClipboard();
      const event = selected('copy', clipboard);
      const outcome = interceptCopyEvent(event, { transform: () => decision as string });
      expect(outcome).toMatchObject({ status: 'failed', error: { type }, fallback: 'block' });
      expect(event.defaultPrevented).toBe(true);
      expect(clipboard.setData).not.toHaveBeenCalled();
    });

    it('fails closed when the transform throws, keeping the cause', () => {
      const cause = new Error('bug');
      const event = selected();
      const outcome = interceptCopyEvent(event, {
        transform: () => {
          throw cause;
        },
      });
      expect(outcome).toMatchObject({ status: 'failed', error: { type: 'invalid-payload', cause }, fallback: 'block' });
      expect(event.defaultPrevented).toBe(true);
    });

    it('lets the native copy through with failureMode "native"', () => {
      const event = selected();
      const outcome = interceptCopyEvent(event, {
        failureMode: 'native',
        transform: () => {
          throw new Error('bug');
        },
      });
      expect(outcome).toMatchObject({ status: 'failed', fallback: 'native' });
      expect(event.defaultPrevented).toBe(false);
    });

    it('fails as unsupported without clipboardData', () => {
      const event = selected('copy', null);
      expect(interceptCopyEvent(event, write('x'))).toMatchObject({ status: 'failed', error: { type: 'unsupported' }, fallback: 'block' });
      expect(event.defaultPrevented).toBe(true);
    });

    it('clears a half-written clipboard and always blocks when setData throws', () => {
      const clipboard = fakeClipboard();
      clipboard.setData.mockImplementationOnce(() => undefined).mockImplementationOnce(() => {
        throw Object.assign(new Error('no'), { name: 'NotAllowedError' });
      });
      const event = selected('copy', clipboard);
      const outcome = interceptCopyEvent(event, { failureMode: 'native', transform: () => ({ kind: 'html', html: '<i>a</i>', text: 'a' }) });
      expect(outcome).toMatchObject({ status: 'failed', error: { type: 'unknown', cause: expect.any(Error) }, fallback: 'block' });
      expect(clipboard.clearData).toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
    });

    it('survives clipboards whose clearData is missing or throws', () => {
      const throwingSet = (): never => {
        throw new Error('set');
      };
      const noClear: ClipboardDataLike = { setData: throwingSet };
      expect(interceptCopyEvent(selected('copy', noClear), write('x')).status).toBe('failed');

      const badClear: ClipboardDataLike = {
        setData: throwingSet,
        clearData: () => {
          throw new Error('clear');
        },
      };
      expect(interceptCopyEvent(selected('copy', badClear), write('x')).status).toBe('failed');
    });
  });

  describe('cut', () => {
    function cutInField(execCommand?: unknown) {
      const host = mount('<input id="i" value="api-key-123" />');
      const input = host.querySelector('#i') as HTMLInputElement;
      selectInField(input, 0, 7);
      Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
      return eventLike('cut', input);
    }

    afterEach(() => {
      Reflect.deleteProperty(document, 'execCommand');
    });

    it('deletes the selection like a native cut after writing', () => {
      const execCommand = vi.fn(() => true);
      const outcome = interceptCopyEvent(cutInField(execCommand), write('[redacted]'));
      expect(outcome).toMatchObject({ status: 'written', deleted: true });
      expect(execCommand).toHaveBeenCalledWith('delete');
    });

    it('reports deleted: false when deletion is refused, missing or throws', () => {
      expect(interceptCopyEvent(cutInField(() => false), write('x'))).toMatchObject({ deleted: false });
      expect(interceptCopyEvent(cutInField(undefined), write('x'))).toMatchObject({ deleted: false });
      const throwing = () => {
        throw new Error('nope');
      };
      expect(interceptCopyEvent(cutInField(throwing), write('x'))).toMatchObject({ deleted: false });
    });

    it('never deletes non-editable content, and a blocked cut deletes nothing', () => {
      const execCommand = vi.fn(() => true);
      Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
      expect(interceptCopyEvent(selected('cut'), write('x'))).toMatchObject({ status: 'written', deleted: false });
      expect(interceptCopyEvent(cutInField(execCommand), write(false))).toMatchObject({ status: 'blocked' });
      expect(execCommand).not.toHaveBeenCalled();
    });
  });
});

/* ──────────────────────────────────────────────── registerCopyInterceptor */

describe('registerCopyInterceptor', () => {
  it('defaults to intercepting copy and cut', () => {
    expect(DEFAULT_INTERCEPTED_EVENTS).toEqual(['copy', 'cut']);
  });

  it('intercepts selections inside its root and reports the outcome', () => {
    const host = mount('<article id="doc">Guide text</article>');
    const root = host.querySelector('#doc') as HTMLElement;
    const onIntercept = vi.fn();
    const stop = registerCopyInterceptor(root, { transform: ({ text }) => `${text} — Source: Acme`, onIntercept });

    selectContents(root);
    const { clipboard, event } = dispatchCopy(root);
    expect(clipboard.data.get('text/plain')).toBe('Guide text — Source: Acme');
    expect(event.defaultPrevented).toBe(true);
    expect(onIntercept).toHaveBeenCalledWith(expect.objectContaining({ status: 'written' }));
    stop();
  });

  it('catches selections that start outside the root but reach into it', () => {
    const host = mount('<p id="before">public</p><p id="secret">token</p>');
    const secret = host.querySelector('#secret') as HTMLElement;
    const stop = registerCopyInterceptor(secret, { transform: () => false });

    const range = document.createRange();
    range.setStart(host.querySelector('#before')?.firstChild as Node, 0);
    range.setEnd(secret.firstChild as Node, 3);
    document.getSelection()?.addRange(range);

    // The event targets the start of the selection, outside the scope.
    const { event, clipboard } = dispatchCopy(host.querySelector('#before') as HTMLElement);
    expect(event.defaultPrevented).toBe(true);
    expect(clipboard.setData).not.toHaveBeenCalled();
    stop();
  });

  it('ignores selections outside every scope', () => {
    const host = mount('<p id="in">in</p><p id="out">out</p>');
    const transform = vi.fn(() => 'x');
    const onIntercept = vi.fn();
    const stop = registerCopyInterceptor(host.querySelector('#in') as Element, { transform, onIntercept });
    selectContents(host.querySelector('#out') as Node);
    const { event } = dispatchCopy(host.querySelector('#out') as Element);
    expect(transform).not.toHaveBeenCalled();
    expect(onIntercept).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    stop();
  });

  it('ignores copies with no selection at all', () => {
    const host = mount('<p>idle</p>');
    const transform = vi.fn(() => 'x');
    const stop = registerCopyInterceptor(host, { transform });
    document.getSelection()?.removeAllRanges();
    expect(dispatchCopy(host).event.defaultPrevented).toBe(false);
    expect(transform).not.toHaveBeenCalled();
    stop();
  });

  it('scopes text-field selections by the field', () => {
    const host = mount('<form id="f"><input id="i" value="hunter2" /></form><input id="o" value="other" />');
    const transform = vi.fn(() => '••••');
    const stop = registerCopyInterceptor(host.querySelector('#f') as Element, { transform });

    const inside = host.querySelector('#i') as HTMLInputElement;
    selectInField(inside, 0, 7);
    expect(dispatchCopy(inside).clipboard.data.get('text/plain')).toBe('••••');

    const outside = host.querySelector('#o') as HTMLInputElement;
    selectInField(outside, 0, 5);
    expect(dispatchCopy(outside).event.defaultPrevented).toBe(false);
    expect(transform).toHaveBeenCalledTimes(1);
    stop();
  });

  it('only listens to the configured events', () => {
    const host = mount('<p>only copy</p>');
    const transform = vi.fn(() => 'x');
    const stop = registerCopyInterceptor(host, { transform, events: ['copy'] });
    selectContents(host);
    expect(dispatchCopy(host, 'cut').event.defaultPrevented).toBe(false);
    expect(dispatchCopy(host, 'copy').event.defaultPrevented).toBe(true);
    stop();
  });

  it('reads the latest options through a getter on every event', () => {
    const host = mount('<p>live</p>');
    let suffix = 'v1';
    const stop = registerCopyInterceptor(host, () => ({ transform: ({ text }) => `${text}-${suffix}` }));
    selectContents(host);
    expect(dispatchCopy(host).clipboard.data.get('text/plain')).toBe('live-v1');
    suffix = 'v2';
    expect(dispatchCopy(host).clipboard.data.get('text/plain')).toBe('live-v2');
    stop();
  });

  it.each([
    ['outer registered first', ['#outer', '#inner']],
    ['inner registered first', ['#inner', '#outer']],
  ] as const)('lets the innermost scope win (%s)', (_label, order) => {
    const host = mount('<section id="outer"><div id="inner">nested</div></section>');
    const stops = order.map((id) => registerCopyInterceptor(host.querySelector(id) as Element, { transform: () => id }));
    selectContents(host.querySelector('#inner') as Node);
    expect(dispatchCopy(host.querySelector('#inner') as Element).clipboard.data.get('text/plain')).toBe('#inner');
    for (const stop of stops) stop();
  });

  it('never leaks redacted content from a selection spanning a lower-priority sibling', () => {
    // Regression: found in real Chromium. Without priority, the first scope in
    // document order handled the whole selection and the secret escaped.
    const host = mount('<article id="doc">Guide</article><div id="vault">Key: <span data-redact>sk-live-1</span></div>');
    const stopDoc = registerCopyInterceptor(host.querySelector('#doc') as Element, { transform: ({ text }) => `${text} — Source` });
    const stopVault = registerCopyInterceptor(host.querySelector('#vault') as Element, {
      priority: 10,
      transform: ({ text }) => text.replace(/sk-live-\w+/g, '••••'),
    });
    selectContents(host);
    const text = dispatchCopy(host).clipboard.data.get('text/plain');
    expect(text).toBe('GuideKey: ••••');
    expect(text).not.toContain('sk-live');
    stopDoc();
    stopVault();
  });

  it('lets a higher-priority outer scope override an inner one', () => {
    const host = mount('<main id="page"><article id="doc">nested</article></main>');
    const stops = [
      registerCopyInterceptor(host.querySelector('#doc') as Element, { transform: () => 'inner' }),
      registerCopyInterceptor(host.querySelector('#page') as Element, { priority: 1, transform: () => false }),
    ];
    selectContents(host.querySelector('#doc') as Node);
    const { event, clipboard } = dispatchCopy(host.querySelector('#doc') as Element);
    expect(event.defaultPrevented).toBe(true);
    expect(clipboard.setData).not.toHaveBeenCalled();
    for (const stop of stops) stop();
  });

  it('resolves two scopes on the same element by registration order', () => {
    const host = mount('<p>same</p>');
    const stops = [
      registerCopyInterceptor(host, { transform: () => 'first' }),
      registerCopyInterceptor(host, { transform: () => 'second' }),
    ];
    selectContents(host);
    expect(dispatchCopy(host).clipboard.data.get('text/plain')).toBe('first');
    for (const stop of stops) stop();
  });

  it.each([
    ['first-registered first', ['#a', '#b']],
    ['first-registered last', ['#b', '#a']],
  ] as const)('resolves unrelated scopes in document order (%s)', (_label, order) => {
    const host = mount('<p id="a">A</p><p id="b">B</p>');
    const stops = order.map((id) => registerCopyInterceptor(host.querySelector(id) as Element, { transform: () => id }));
    selectContents(host);
    expect(dispatchCopy(host).clipboard.data.get('text/plain')).toBe('#a');
    for (const stop of stops) stop();
  });

  it('defers to handlers that already prevented the default', () => {
    const host = mount('<p id="p">mine</p>');
    const p = host.querySelector('#p') as HTMLElement;
    p.addEventListener('copy', (event) => {
      event.preventDefault();
    });
    const transform = vi.fn(() => 'x');
    const stop = registerCopyInterceptor(p, { transform });
    selectContents(p);
    dispatchCopy(p);
    expect(transform).not.toHaveBeenCalled();
    stop();
  });

  it('reports failures through onError, and callback errors never break the copy', () => {
    const reportError = vi.fn();
    vi.stubGlobal('reportError', reportError);
    try {
      const host = mount('<p>err</p>');
      const onError = vi.fn(() => {
        throw new Error('handler bug');
      });
      const onIntercept = vi.fn((outcome: CopyInterceptOutcome) => {
        throw new Error(`intercept bug ${outcome.status}`);
      });
      const stop = registerCopyInterceptor(host, { transform: () => '', onError, onIntercept });
      selectContents(host);
      const { event } = dispatchCopy(host);
      expect(event.defaultPrevented).toBe(true);
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ type: 'invalid-payload' }));
      expect(reportError).toHaveBeenCalledTimes(2);
      stop();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not call onError for successful outcomes', () => {
    const host = mount('<p>ok</p>');
    const onError = vi.fn();
    const stop = registerCopyInterceptor(host, { transform: () => 'fine', onError });
    selectContents(host);
    dispatchCopy(host);
    expect(onError).not.toHaveBeenCalled();
    stop();
  });

  it('shares one document listener and removes it with the last scope', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const host = mount('<p id="a">a</p><p id="b">b</p>');
    const stopA = registerCopyInterceptor(host.querySelector('#a') as Element, { transform: () => 'a' });
    const stopB = registerCopyInterceptor(host.querySelector('#b') as Element, { transform: () => 'b' });
    expect(add.mock.calls.filter(([type]) => type === 'copy' || type === 'cut')).toHaveLength(2);

    stopA();
    stopA(); // idempotent
    expect(remove).not.toHaveBeenCalled();
    stopB();
    expect(remove.mock.calls.map(([type]) => type)).toEqual(['copy', 'cut']);

    // A fresh registration re-attaches.
    const stopAgain = registerCopyInterceptor(host, { transform: () => 'again' });
    selectContents(host);
    expect(dispatchCopy(host).clipboard.data.get('text/plain')).toBe('again');
    stopAgain();
  });

  it('exposes the selection to the transform for redaction', () => {
    const host = mount('<p>user <span data-redact>4111 1111</span> paid</p>');
    let seen: CopySelection | undefined;
    const stop = registerCopyInterceptor(host, {
      transform: (selection) => {
        seen = selection;
        const fragment = selection.fragment;
        fragment?.querySelectorAll('[data-redact]').forEach((node) => {
          node.textContent = '••••';
        });
        const box = document.createElement('div');
        if (fragment) box.appendChild(fragment);
        return { kind: 'html', html: box.innerHTML, text: box.textContent };
      },
    });
    selectContents(host);
    const { clipboard } = dispatchCopy(host);
    expect(seen?.text).toBe('user 4111 1111 paid');
    expect(clipboard.data.get('text/plain')).toBe('user •••• paid');
    expect(clipboard.data.get('text/html')).toContain('<span data-redact="">••••</span>');
    stop();
  });
});
