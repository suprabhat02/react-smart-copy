import { copyFailure } from '../core/errors';
import { utf8ByteLength } from '../core/paste-reader';
import { encodeBase64Url } from './base64url';
import { CLIP_HTML_ATTRIBUTE, serializeEnvelope } from './envelope';
import { assertClipFormat } from './guard';
import type { ClipFormat } from './format';

/** One clipboard entry of a {@link ClipPayload}. Strings only, so it also works in copy and drag events. */
export interface ClipPayloadItem {
  readonly mimeType: string;
  readonly data: string;
  readonly optional?: boolean;
}

/**
 * A multi-format payload carrying a clip. Pass it to `copy()`, return it from a
 * `useCopyInterceptor` transform or a `useDragCopy` source: each path writes the
 * carriers it can.
 */
export interface ClipPayload {
  readonly kind: 'multi';
  readonly items: readonly ClipPayloadItem[];
}

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] as string);

/** Plain text as HTML: escaped, with line breaks kept (many targets drop `white-space` styles). */
const textToHtml = (text: string): string => escapeHtml(text).replace(/\r\n|\r|\n/g, '<br>');

/**
 * Builds the payload that puts `value` on the clipboard in `format`, through three carriers:
 *
 * 1. `web application/vnd.<id>+json`: the async Clipboard API's web custom format
 *    (Chromium). Read back by `navigator.clipboard.read()`, also across origins.
 * 2. `application/vnd.<id>+json`: written by copy and drag events, read back by
 *    paste and drop events.
 * 3. A hidden envelope in `text/html`, which every paste path in every browser keeps.
 *
 * Plus `text/plain` (and visible HTML) for every other app. Carriers a browser
 * cannot write are skipped. {@link readClip} tries them in this order.
 *
 * Synchronous, so it can be built inside the user gesture. Throws a classified
 * `CopyFailure`: `invalid-payload` when the data is not JSON-safe, `too-large`
 * when it exceeds the format's `maxBytes`.
 */
export function clipPayload<Value>(format: ClipFormat<Value>, value: Value): ClipPayload {
  assertClipFormat(format);
  const data = format.encode ? format.encode(value) : value;
  const envelope = serializeEnvelope(format, data);
  if (utf8ByteLength(envelope) > format.maxBytes) {
    throw copyFailure('too-large', `Clip "${format.id}" data exceeds the ${String(format.maxBytes)}-byte limit.`);
  }

  const text: unknown = format.text ? format.text(value) : JSON.stringify(data, null, 2);
  if (typeof text !== 'string' || text.length === 0) {
    throw copyFailure('invalid-payload', `Clip "${format.id}": \`text\` must return a non-empty string.`);
  }
  const visible: unknown = format.html ? format.html(value) : textToHtml(text);
  if (typeof visible !== 'string') {
    throw copyFailure('invalid-payload', `Clip "${format.id}": \`html\` must return a string.`);
  }

  const items: ClipPayloadItem[] = [
    { mimeType: format.webMimeType, data: envelope, optional: true },
    { mimeType: format.mimeType, data: envelope, optional: true },
  ];
  const html = format.embedInHtml
    ? `<span ${CLIP_HTML_ATTRIBUTE}="${format.id};${encodeBase64Url(envelope)}"></span>${visible}`
    : visible;
  if (html.length > 0) items.push({ mimeType: 'text/html', data: html });
  items.push({ mimeType: 'text/plain', data: text });
  return { kind: 'multi', items };
}
