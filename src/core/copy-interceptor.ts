import { createCopyError, type CopyError } from './errors';
import { invoke } from './machine-shared';
import type { HtmlPayload, JsonPayload, TextPayload } from './payload';

/**
 * Native copy interception: rewrite, redact or block what lands on the
 * clipboard when the user copies (Ctrl/Cmd+C, context menu) or cuts inside a
 * scope.
 *
 * Writes go through `event.clipboardData` synchronously, so no permission
 * prompt, no secure-context requirement, and it works in every browser. The
 * price is that only strings can be written, which the types enforce.
 *
 * Not a security boundary: users can still screenshot, use dev tools or
 * disable script. Treat redaction as a guard against accidents.
 */

export type InterceptedCopyKind = 'copy' | 'cut';

export const DEFAULT_INTERCEPTED_EVENTS: readonly InterceptedCopyKind[] = ['copy', 'cut'];

/** The writable slice of `DataTransfer` during a `copy`/`cut` event. */
export interface ClipboardDataLike {
  setData(format: string, data: string): void;
  clearData?(format?: string): void;
}

/** Structural `ClipboardEvent`: DOM and React clipboard events both satisfy it. */
export interface CopyEventLike {
  readonly type: string;
  readonly target: EventTarget | null;
  readonly clipboardData: ClipboardDataLike | null;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/** What the user selected when they copied. */
export interface CopySelection {
  readonly kind: InterceptedCopyKind;
  /** What the browser would put on the clipboard as `text/plain`. */
  readonly text: string;
  /** Serialised HTML of the selection; `null` inside text inputs. */
  readonly html: string | null;
  /** A detached clone of the selected nodes, safe to mutate; `null` inside text inputs. */
  readonly fragment: DocumentFragment | null;
  /** The `<input>`/`<textarea>` the selection lives in, if any. */
  readonly field: HTMLInputElement | HTMLTextAreaElement | null;
  /** Whether a `cut` would remove the selection (form field or contenteditable). */
  readonly editable: boolean;
}

/** A multi payload whose items are all strings; the only kind `setData` accepts. */
export interface SyncMultiPayload {
  readonly kind: 'multi';
  readonly items: readonly { readonly mimeType: string; readonly data: string }[];
}

/** Payloads writable synchronously during a copy event. Images need the async clipboard. */
export type SyncCopyPayload = TextPayload | HtmlPayload | JsonPayload | SyncMultiPayload;

/**
 * What a transform returns:
 * - a string or payload: write that instead of the selection
 * - `false`: block the copy (nothing reaches the clipboard; a cut deletes nothing)
 * - `null` / `undefined`: leave the browser's default copy untouched
 *
 * Must be synchronous: the clipboard closes when the event handler returns.
 */
export type CopyInterceptDecision = string | SyncCopyPayload | false | null | undefined;

export type CopyInterceptTransform = (selection: CopySelection) => CopyInterceptDecision;

/**
 * When the transform throws or returns something unwritable:
 * - `'block'` (default): nothing is copied. Safe for redaction.
 * - `'native'`: the browser's default copy proceeds unmodified.
 */
export type CopyInterceptFailureMode = 'block' | 'native';

export interface CopyInterceptOptions {
  readonly transform: CopyInterceptTransform;
  readonly failureMode?: CopyInterceptFailureMode;
}

export type CopyInterceptPassReason =
  /** Not a `copy`/`cut` event. */
  | 'unsupported-event'
  /** Another handler already called `preventDefault()`. */
  | 'already-handled'
  /** Nothing readable was selected. */
  | 'no-selection'
  /** The transform returned `null`/`undefined`. */
  | 'declined';

export type CopyInterceptOutcome =
  | {
      readonly status: 'passed';
      readonly reason: CopyInterceptPassReason;
      readonly selection: CopySelection | null;
    }
  | {
      readonly status: 'written';
      readonly selection: CopySelection;
      readonly payload: SyncCopyPayload;
      /** For an editable `cut`: whether the selection was removed. Always `false` for `copy`. */
      readonly deleted: boolean;
    }
  | { readonly status: 'blocked'; readonly selection: CopySelection }
  | {
      readonly status: 'failed';
      readonly selection: CopySelection;
      readonly error: CopyError;
      /** What actually happened to the copy. */
      readonly fallback: CopyInterceptFailureMode;
    };

/* ─────────────────────────────────────────────────────── selection reading */

type TextField = HTMLInputElement | HTMLTextAreaElement;

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && typeof (value as Node).nodeType === 'number';
}

interface FieldSelection {
  readonly field: TextField;
  readonly start: number;
  readonly end: number;
}

function readTextField(target: EventTarget | null): FieldSelection | null {
  if (!isNode(target) || target.nodeType !== 1) return null;
  const tag = (target as Element).tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') return null;
  const field = target as TextField;
  try {
    // `null` (or a throw, in older engines) for input types without text selection.
    const { selectionStart: start, selectionEnd: end } = field;
    return typeof start === 'number' && typeof end === 'number' ? { field, start, end } : null;
  } catch {
    return null;
  }
}

function documentOf(target: EventTarget | null): Document | null {
  if (isNode(target)) return target.nodeType === 9 ? (target as Document) : target.ownerDocument;
  return typeof document === 'undefined' ? null : document;
}

function isEditableNode(node: Node): boolean {
  const element = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
  return element?.isContentEditable === true;
}

interface SelectedRanges {
  readonly selection: Selection;
  readonly ranges: readonly Range[];
}

function selectedRanges(doc: Document | null): SelectedRanges | null {
  const selection = doc?.getSelection();
  if (!selection || selection.isCollapsed) return null;
  const ranges: Range[] = [];
  for (let index = 0; index < selection.rangeCount; index += 1) ranges.push(selection.getRangeAt(index));
  return { selection, ranges };
}

interface ReadSelection {
  readonly selection: CopySelection;
  readonly doc: Document;
}

function readSelection(event: CopyEventLike): ReadSelection | null {
  const kind: InterceptedCopyKind = event.type === 'cut' ? 'cut' : 'copy';
  const fieldSelection = readTextField(event.target);
  if (fieldSelection) {
    const { field, start, end } = fieldSelection;
    const text = field.value.slice(Math.min(start, end), Math.max(start, end));
    if (text.length === 0) return null;
    const editable = !field.readOnly && !field.disabled;
    return { selection: { kind, text, html: null, fragment: null, field, editable }, doc: field.ownerDocument };
  }

  const doc = documentOf(event.target);
  const selected = selectedRanges(doc);
  const first = selected?.ranges[0];
  if (!doc || !selected || !first) return null;
  // `Selection#toString` follows the rendered layout, like the browser's own copy;
  // `Range#toString` would leak source whitespace and hidden text.
  const text = selected.selection.toString();
  if (text.length === 0) return null;

  const container = doc.createElement('div');
  for (const range of selected.ranges) container.appendChild(range.cloneContents());
  const html = container.innerHTML;
  const fragment = doc.createDocumentFragment();
  while (container.firstChild) fragment.appendChild(container.firstChild);

  const editable = isEditableNode(first.startContainer);
  return { selection: { kind, text, html, fragment, field: null, editable }, doc };
}

/** Reads the selection behind a copy event, or `null` if nothing readable is selected. */
export function readCopySelection(event: CopyEventLike): CopySelection | null {
  const read = readSelection(event);
  return read ? read.selection : null;
}

/* ─────────────────────────────────────────────────────────────── writing */

type Entries = readonly (readonly [mimeType: string, data: string])[];

type Prepared =
  | { readonly ok: true; readonly payload: SyncCopyPayload; readonly entries: Entries }
  | { readonly ok: false; readonly error: CopyError };

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const invalid = (message: string, cause?: unknown): Prepared => ({
  ok: false,
  error: createCopyError('invalid-payload', message, cause),
});
const unsupported = (message: string): Prepared => ({ ok: false, error: createCopyError('unsupported-format', message) });

/**
 * Validates a decision and turns it into `[mimeType, data]` pairs. Kept
 * self-contained (no shared validator) so the interceptor stays small; the
 * checks still run for plain-JS callers the types can't protect.
 */
function prepare(decision: string | SyncCopyPayload): Prepared {
  const candidate: unknown = typeof decision === 'string' ? { kind: 'text', value: decision } : decision;
  if (typeof candidate !== 'object' || candidate === null) {
    return invalid('Copy transforms must return a string, a payload, false, or nothing.');
  }
  if (typeof (candidate as { then?: unknown }).then === 'function') {
    return invalid('Copy transforms must be synchronous; the clipboard closes when the event ends.');
  }
  const payload = candidate as SyncCopyPayload;
  const fields = candidate as Record<string, unknown>;
  const ok = (entries: Entries): Prepared => ({ ok: true, payload, entries });

  switch (fields['kind']) {
    case 'text':
      return nonEmpty(fields['value']) ? ok([['text/plain', fields['value']]]) : invalid('Text payload must be a non-empty string.');
    case 'html':
      return nonEmpty(fields['html']) && nonEmpty(fields['text'])
        ? ok([['text/html', fields['html']], ['text/plain', fields['text']]])
        : invalid('HTML payload requires non-empty `html` and plain-text `text`.');
    case 'json': {
      const pretty = fields['pretty'];
      const indent = pretty === true ? 2 : typeof pretty === 'number' ? pretty : undefined;
      // Typed as `string`, but `undefined` for functions, symbols and undefined.
      let json: unknown;
      try {
        json = JSON.stringify(fields['value'], null, indent);
      } catch (cause) {
        return invalid('JSON payload could not be serialised (circular reference or BigInt?).', cause);
      }
      return typeof json === 'string' ? ok([['text/plain', json]]) : invalid('JSON payload serialised to nothing.');
    }
    case 'multi': {
      const items = fields['items'];
      if (!Array.isArray(items) || items.length === 0) return invalid('Multi payload requires at least one item.');
      const entries: (readonly [string, string])[] = [];
      for (const item of items as unknown[]) {
        const { mimeType, data } = (item ?? {}) as { mimeType?: unknown; data?: unknown };
        if (!nonEmpty(mimeType) || entries.some(([seen]) => seen === mimeType)) {
          return invalid('Every multi item needs a unique, non-empty `mimeType`.');
        }
        if (typeof data !== 'string') return unsupported(`Multi item "${mimeType}" must be a string during a copy event.`);
        entries.push([mimeType, data]);
      }
      return ok(entries);
    }
    default:
      return unsupported(`"${String(fields['kind'])}" payloads cannot be written during a copy event; use useCopy() for images.`);
  }
}

/** Deletes the selection the way a native cut would (keeps undo history, fires `input`). */
function deleteSelection(doc: Document): boolean {
  const legacy = doc as unknown as { execCommand?: (command: string) => boolean };
  try {
    return legacy.execCommand?.('delete') === true;
  } catch {
    return false;
  }
}

/**
 * Applies a transform to one `copy`/`cut` event. Use directly from an
 * `onCopy` handler, or let {@link registerCopyInterceptor} scope it.
 */
export function interceptCopyEvent(event: CopyEventLike, options: CopyInterceptOptions): CopyInterceptOutcome {
  if (event.type !== 'copy' && event.type !== 'cut') {
    return { status: 'passed', reason: 'unsupported-event', selection: null };
  }
  if (event.defaultPrevented) return { status: 'passed', reason: 'already-handled', selection: null };

  const read = readSelection(event);
  if (!read) return { status: 'passed', reason: 'no-selection', selection: null };
  const { selection, doc } = read;

  const fail = (error: CopyError): CopyInterceptOutcome => {
    const fallback = options.failureMode ?? 'block';
    if (fallback === 'block') event.preventDefault();
    return { status: 'failed', selection, error, fallback };
  };

  let decision: CopyInterceptDecision;
  try {
    decision = options.transform(selection);
  } catch (cause) {
    return fail(createCopyError('invalid-payload', 'The copy transform threw.', cause));
  }

  if (decision === null || decision === undefined) return { status: 'passed', reason: 'declined', selection };
  if (decision === false) {
    event.preventDefault();
    return { status: 'blocked', selection };
  }

  const prepared = prepare(decision);
  if (!prepared.ok) return fail(prepared.error);

  const data = event.clipboardData;
  if (!data) return fail(createCopyError('unsupported', 'This browser exposes no clipboardData on copy events.'));

  // From here the browser's default is gone: a failure can only end in `block`.
  event.preventDefault();
  try {
    for (const [mimeType, value] of prepared.entries) data.setData(mimeType, value);
  } catch (cause) {
    try {
      data.clearData?.();
    } catch {
      // Best effort: a half-written clipboard is still better reported than hidden.
    }
    const error = createCopyError('unknown', 'The browser rejected the clipboard write.', cause);
    return { status: 'failed', selection, error, fallback: 'block' };
  }

  const deleted = selection.kind === 'cut' && selection.editable && deleteSelection(doc);
  return { status: 'written', selection, payload: prepared.payload, deleted };
}

/* ────────────────────────────────────────────────────────────── scoping */

export interface CopyInterceptorOptions extends CopyInterceptOptions {
  /**
   * When one selection touches several scopes, exactly one handles it: the
   * highest `priority`, then the innermost, then the first in the document.
   * The winner sees the *whole* selection. Give redaction scopes a higher
   * priority so text copied across them is always masked. Default `0`.
   */
  readonly priority?: number;
  /** Which events to intercept. Default: both `copy` and `cut`. */
  readonly events?: readonly InterceptedCopyKind[];
  /** Every outcome for selections inside this scope, including `passed`. */
  readonly onIntercept?: (outcome: CopyInterceptOutcome) => void;
  /** Called when the transform failed; the outcome's `fallback` says what happened to the copy. */
  readonly onError?: (error: CopyError) => void;
}

interface Scope {
  readonly root: Element;
  readonly read: () => CopyInterceptorOptions;
}

interface Registry {
  readonly scopes: Set<Scope>;
  readonly listener: (event: Event) => void;
}

const registries = /* @__PURE__ */ new WeakMap<Document, Registry>();

function touches(root: Element, event: CopyEventLike): boolean {
  const fieldSelection = readTextField(event.target);
  if (fieldSelection) return root.contains(fieldSelection.field);
  const selected = selectedRanges(root.ownerDocument);
  return selected !== null && selected.ranges.some((range) => range.intersectsNode(root));
}

const priorityOf = (scope: Scope): number => scope.read().priority ?? 0;

/**
 * Highest `priority` first; then the innermost scope; then document order;
 * then registration order (same root). A total order, so the result never
 * depends on effect timing.
 */
function compareScopes(a: Scope, b: Scope): number {
  const byPriority = priorityOf(b) - priorityOf(a);
  if (byPriority !== 0) return byPriority;
  const position = a.root.compareDocumentPosition(b.root);
  if (position === 0) return 0;
  if (position & 16) return 1; // b is inside a: b first
  if (position & 8) return -1; // b contains a: a first
  return position & 4 ? -1 : 1; // b follows a: a first
}

function dispatch(registry: Registry, event: CopyEventLike): void {
  if (event.defaultPrevented) return;
  const kind = event.type as InterceptedCopyKind;
  const candidates = [...registry.scopes].filter(
    (scope) => (scope.read().events ?? DEFAULT_INTERCEPTED_EVENTS).includes(kind) && touches(scope.root, event),
  );
  const [scope] = candidates.sort(compareScopes);
  if (!scope) return;

  const options = scope.read();
  const outcome = interceptCopyEvent(event, options);
  invoke(options.onIntercept, outcome);
  if (outcome.status === 'failed') invoke(options.onError, outcome.error);
}

/**
 * Intercepts native copies and cuts whose selection touches `root`. Returns
 * an unsubscribe function. Pass a getter to always read the latest options.
 *
 * One listener per document serves every scope, so overlapping scopes
 * resolve deterministically (see `priority`) regardless of registration order.
 * Handlers that call `preventDefault()` first (e.g. a React `onCopy`) win.
 */
export function registerCopyInterceptor(
  root: Element,
  options: CopyInterceptorOptions | (() => CopyInterceptorOptions),
): () => void {
  const doc = root.ownerDocument;
  let registry = registries.get(doc);
  if (!registry) {
    const scopes = new Set<Scope>();
    const created: Registry = {
      scopes,
      listener: (event) => {
        dispatch(created, event as unknown as CopyEventLike);
      },
    };
    registry = created;
    registries.set(doc, created);
    doc.addEventListener('copy', created.listener);
    doc.addEventListener('cut', created.listener);
  }

  const scope: Scope = { root, read: typeof options === 'function' ? options : () => options };
  registry.scopes.add(scope);
  const active = registry;

  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    active.scopes.delete(scope);
    if (active.scopes.size === 0) {
      doc.removeEventListener('copy', active.listener);
      doc.removeEventListener('cut', active.listener);
      registries.delete(doc);
    }
  };
}
