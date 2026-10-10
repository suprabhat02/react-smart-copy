/**
 * Drag-to-copy: populate `DataTransfer` when the user starts dragging an
 * element, so whatever they drop it into receives structured data — plain text,
 * HTML, JSON, or multiple MIME types — instead of the browser's default
 * text-extraction of the dragged DOM.
 *
 * No Clipboard API, no permission prompt, works in every browser that supports
 * HTML5 drag-and-drop (all modern browsers and IE11+).
 */

import { invoke } from './machine-shared';
import { createCopyError, type CopyError } from './errors';
import type { HtmlPayload, JsonPayload, TextPayload } from './payload';

/* ─────────────────────────────────────────────────────────────────── types */

/**
 * The `effectAllowed` a drag operation advertises. Controls which cursor the
 * browser shows and which `dropEffect` the drop target may request.
 *
 * - `'copy'` (default): dragging produces a copy of the data.
 * - `'move'`: dragging removes the source after a drop (the app must do this).
 * - `'link'`: dragging creates a link/reference.
 * - `'copyMove'` / `'copyLink'` / `'linkMove'` / `'all'`: combinations.
 * - `'none'`: the drag is not droppable anywhere.
 * - `'uninitialized'`: browser default (same as `'all'` in most cases).
 */
export type DragEffectAllowed =
  | 'copy'
  | 'move'
  | 'link'
  | 'copyMove'
  | 'copyLink'
  | 'linkMove'
  | 'all'
  | 'none'
  | 'uninitialized';

/** What is put into `DataTransfer` when a drag starts. */
export interface DragCopyItem {
  readonly mimeType: string;
  readonly data: string;
}

/**
 * A multi-format drag payload — strings only (DataTransfer only accepts strings).
 * Mirrors `SyncCopyPayload` from copy-interceptor but scoped to drag.
 */
export type DragCopyPayload = TextPayload | HtmlPayload | JsonPayload | DragMultiPayload;

export interface DragMultiPayload {
  readonly kind: 'multi';
  readonly items: readonly DragCopyItem[];
}

/**
 * What the source getter returns:
 * - a string: written as `text/plain`.
 * - a `DragCopyPayload`: written according to its `kind`.
 * - `false`: cancels the drag (`preventDefault()` on `dragstart`).
 * - `null` / `undefined`: leaves the browser's default drag data untouched.
 */
export type DragCopyDecision = string | DragCopyPayload | false | null | undefined;

/** Called once when the user begins dragging the element. Must be synchronous. */
export type DragCopySource = (event: DragStartEventLike) => DragCopyDecision;

/** Structural `DragEvent`: DOM and React drag events both satisfy it. */
export interface DragStartEventLike {
  readonly type: string;
  readonly dataTransfer: DataTransferLike | null;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/** The writable face of `DataTransfer`. */
export interface DataTransferLike {
  effectAllowed: string;
  setData(format: string, data: string): void;
  clearData?(format?: string): void;
}

export type DragCopyStatus =
  /** No drag has started yet, or it was cancelled / never had source data. */
  | 'idle'
  /** The element is being dragged and data is on the DataTransfer. */
  | 'dragging'
  /** The drag ended (dropped or abandoned). */
  | 'done';

export type DragCopyPassReason =
  /** Source returned `null`/`undefined`. */
  | 'declined'
  /** `DataTransfer` is not present on this event. */
  | 'no-transfer'
  /** Source returned `false`. */
  | 'cancelled';

export type DragCopyOutcome =
  | { readonly status: 'written'; readonly payload: DragCopyPayload }
  | { readonly status: 'passed'; readonly reason: DragCopyPassReason }
  | { readonly status: 'failed'; readonly error: CopyError };

export interface DragCopyState {
  readonly status: DragCopyStatus;
  /** The last `dragstart` outcome; `null` before the first drag. */
  readonly outcome: DragCopyOutcome | null;
}

export interface DragCopyOptions {
  /**
   * Returns the data to put in the drag. Called synchronously on `dragstart`.
   * Return a string (shorthand for `{ kind: 'text' }`), a payload object,
   * `false` to cancel the drag, or `null`/`undefined` to pass through.
   */
  readonly source: DragCopySource;
  /**
   * `effectAllowed` advertised on the drag. Default `'copy'`.
   * Setting `'move'` signals to drop targets that the source will be removed.
   */
  readonly effectAllowed?: DragEffectAllowed;
  /**
   * Called each time a drag starts or ends, with the latest outcome and status.
   * Stable across re-renders when written as a class method or via `useRef`.
   */
  readonly onDrag?: (state: DragCopyState) => void;
  /** Called when preparing the drag payload fails. */
  readonly onError?: (error: CopyError) => void;
}

/* ─────────────────────────────────────────────────────────── validation */

const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

type PrepareFail = { readonly ok: false; readonly error: CopyError };
type PrepareOk = { readonly ok: true; readonly payload: DragCopyPayload; readonly items: readonly DragCopyItem[] };
type Prepared = PrepareOk | PrepareFail;

const invalid = (message: string, cause?: unknown): PrepareFail => ({
  ok: false,
  error: createCopyError('invalid-payload', message, cause),
});

const unsupported = (message: string): PrepareFail => ({
  ok: false,
  error: createCopyError('unsupported-format', message),
});

function prepareDragDecision(decision: string | DragCopyPayload): Prepared {
  const candidate: unknown =
    typeof decision === 'string' ? { kind: 'text', value: decision } : decision;

  if (typeof candidate !== 'object' || candidate === null) {
    return invalid('Drag source must return a string, a payload, false, or nothing.');
  }
  if (typeof (candidate as { then?: unknown }).then === 'function') {
    return invalid('Drag sources must be synchronous; DataTransfer closes when dragstart returns.');
  }

  const payload = candidate as DragCopyPayload;
  const fields = candidate as Record<string, unknown>;
  const ok = (items: readonly DragCopyItem[]): PrepareOk => ({ ok: true, payload, items });

  switch (fields['kind']) {
    case 'text':
      return nonEmpty(fields['value'])
        ? ok([{ mimeType: 'text/plain', data: fields['value'] }])
        : invalid('Text payload must be a non-empty string.');

    case 'html':
      return nonEmpty(fields['html']) && nonEmpty(fields['text'])
        ? ok([
            { mimeType: 'text/html', data: fields['html'] },
            { mimeType: 'text/plain', data: fields['text'] },
          ])
        : invalid('HTML payload requires non-empty `html` and `text`.');

    case 'json': {
      const pretty = fields['pretty'];
      const indent =
        pretty === true ? 2 : typeof pretty === 'number' ? pretty : undefined;
      let json: unknown;
      try {
        json = JSON.stringify(fields['value'], null, indent);
      } catch (cause) {
        return invalid(
          'JSON payload could not be serialised (circular reference or BigInt?).',
          cause,
        );
      }
      return typeof json === 'string'
        ? ok([{ mimeType: 'text/plain', data: json }])
        : invalid('JSON payload serialised to nothing.');
    }

    case 'multi': {
      const items = fields['items'];
      if (!Array.isArray(items) || items.length === 0) {
        return invalid('Multi payload requires at least one item.');
      }
      const out: DragCopyItem[] = [];
      for (const item of items as unknown[]) {
        const { mimeType, data } = (item ?? {}) as {
          mimeType?: unknown;
          data?: unknown;
        };
        if (!nonEmpty(mimeType) || out.some((i) => i.mimeType === mimeType)) {
          return invalid('Every multi item needs a unique, non-empty `mimeType`.');
        }
        if (typeof data !== 'string') {
          return unsupported(
            `Multi item "${mimeType}" must be a string; DataTransfer does not accept Blobs.`,
          );
        }
        out.push({ mimeType, data });
      }
      return ok(out);
    }

    default:
      return unsupported(
        `"${String(fields['kind'])}" payloads cannot be used for drag-copy; use useCopy() for images.`,
      );
  }
}

/* ─────────────────────────────────────────────────────── applyDragCopy */

/**
 * Populates a `dragstart` event's `DataTransfer` with the given payload.
 * Use this from a raw `dragstart` handler or a React `onDragStart` prop.
 * Returns the outcome so you can inspect what happened.
 */
export function applyDragCopy(
  event: DragStartEventLike,
  options: DragCopyOptions,
): DragCopyOutcome {
  if (event.defaultPrevented) {
    return { status: 'passed', reason: 'declined' };
  }

  let decision: DragCopyDecision;
  try {
    decision = options.source(event);
  } catch (cause) {
    const error = createCopyError('invalid-payload', 'The drag source threw.', cause);
    return { status: 'failed', error };
  }

  if (decision === null || decision === undefined) {
    return { status: 'passed', reason: 'declined' };
  }

  if (decision === false) {
    event.preventDefault();
    return { status: 'passed', reason: 'cancelled' };
  }

  const transfer = event.dataTransfer;
  if (!transfer) {
    return { status: 'passed', reason: 'no-transfer' };
  }

  const prepared = prepareDragDecision(decision);
  if (!prepared.ok) {
    return { status: 'failed', error: prepared.error };
  }

  try {
    transfer.effectAllowed = options.effectAllowed ?? 'copy';
    for (const { mimeType, data } of prepared.items) {
      transfer.setData(mimeType, data);
    }
  } catch (cause) {
    try {
      transfer.clearData?.();
    } catch {
      // Best effort: report the original error, not a clearData failure.
    }
    const error = createCopyError(
      'unknown',
      'The browser rejected the DataTransfer write.',
      cause,
    );
    return { status: 'failed', error };
  }

  return { status: 'written', payload: prepared.payload };
}

/* ─────────────────────────────────────────────────── registerDragCopy */

export interface RegisterDragCopyResult {
  /** Unsubscribes all listeners. Idempotent. */
  readonly unsubscribe: () => void;
}

/**
 * Attaches `dragstart` and `dragend` listeners to `element`, calling
 * `applyDragCopy` on every drag start. Returns an object with an
 * `unsubscribe` function.
 *
 * Pass an options getter so the latest options are always used without
 * re-registering — safe to pass an inline object from a React render.
 *
 * ```ts
 * const { unsubscribe } = registerDragCopy(el, () => ({
 *   source: () => `${title}\n${url}`,
 * }));
 * ```
 */
export function registerDragCopy(
  element: HTMLElement,
  options: DragCopyOptions | (() => DragCopyOptions),
): RegisterDragCopyResult {
  const read = typeof options === 'function' ? options : (): DragCopyOptions => options;

  let unsubscribed = false;
  let currentOutcome: DragCopyOutcome | null = null;

  function onDragStart(raw: Event): void {
    const event = raw as DragEvent;
    const opts = read();

    const outcome = applyDragCopy(
      {
        type: event.type,
        dataTransfer: event.dataTransfer,
        get defaultPrevented() {
          return event.defaultPrevented;
        },
        preventDefault: () => { event.preventDefault(); },
      },
      opts,
    );

    currentOutcome = outcome;

    const state: DragCopyState = { status: 'dragging', outcome };
    if (outcome.status === 'failed') invoke(opts.onError, outcome.error);
    invoke(opts.onDrag, state);
  }

  function onDragEnd(): void {
    const opts = read();
    const state: DragCopyState = { status: 'done', outcome: currentOutcome };
    invoke(opts.onDrag, state);
    currentOutcome = null;
  }

  element.setAttribute('draggable', 'true');
  element.addEventListener('dragstart', onDragStart);
  element.addEventListener('dragend', onDragEnd);

  return {
    unsubscribe(): void {
      if (unsubscribed) return;
      unsubscribed = true;
      element.removeEventListener('dragstart', onDragStart);
      element.removeEventListener('dragend', onDragEnd);
      element.removeAttribute('draggable');
    },
  };
}
