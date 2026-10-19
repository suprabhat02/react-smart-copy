/**
 * What portable rich text may contain: the elements, attributes and CSS that Gmail,
 * Outlook, Apple Mail, Google Docs, Word, Notion and Slack keep, and nothing that
 * can run, load or track. Everything not listed here is left out.
 */

/** Elements written as they are. */
export const KEEP: ReadonlySet<string> = /* @__PURE__ */ new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'blockquote', 'br', 'caption', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'dfn', 'div', 'dl', 'dt',
  'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's',
  'samp', 'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'u', 'ul', 'var',
]);

/** Elements left out with everything inside them: they run, load, embed, or are page chrome. */
export const DROP: ReadonlySet<string> = /* @__PURE__ */ new Set([
  'applet', 'audio', 'base', 'button', 'canvas', 'datalist', 'dialog', 'embed', 'frame', 'frameset', 'head', 'iframe', 'input', 'link',
  'map', 'math', 'meta', 'meter', 'noembed', 'noframes', 'noscript', 'object', 'option', 'optgroup', 'output', 'param', 'portal',
  'progress', 'script', 'select', 'slot', 'source', 'style', 'svg', 'template', 'textarea', 'title', 'track', 'video',
]);

/** Elements that become a `<div>`: blocks without an email-safe equivalent. */
export const AS_BLOCK: ReadonlySet<string> = /* @__PURE__ */ new Set([
  'address', 'article', 'aside', 'body', 'center', 'details', 'fieldset', 'footer', 'form', 'header', 'hgroup', 'html', 'legend',
  'listing', 'main', 'menu', 'nav', 'plaintext', 'search', 'section', 'summary', 'xmp',
]);

/** Elements whose children are block-level text in the plain-text version. */
export const TEXT_BLOCKS: ReadonlySet<string> = /* @__PURE__ */ new Set([
  'blockquote', 'caption', 'dd', 'div', 'dl', 'dt', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'li', 'ol', 'p',
  'pre', 'table', 'tbody', 'tfoot', 'thead', 'tr', 'ul',
]);

/** What table parts may contain: anything else is moved out of the table by every HTML parser. */
export const TABLE_CHILDREN: Readonly<Record<string, ReadonlySet<string>>> = {
  table: /* @__PURE__ */ new Set(['caption', 'colgroup', 'thead', 'tbody', 'tfoot', 'tr']),
  thead: /* @__PURE__ */ new Set(['tr']),
  tbody: /* @__PURE__ */ new Set(['tr']),
  tfoot: /* @__PURE__ */ new Set(['tr']),
  tr: /* @__PURE__ */ new Set(['td', 'th']),
  colgroup: /* @__PURE__ */ new Set(['col']),
};

/** Elements that hold only text-level content: a block inside one would be split out by HTML parsers. */
export const PHRASING: ReadonlySet<string> = /* @__PURE__ */ new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'del', 'dfn', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'i', 'ins', 'kbd', 'mark', 'p', 'q',
  's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var',
]);

/** Table parts: outside their own parent, HTML parsers ignore their tags. */
export const TABLE_PARTS: ReadonlySet<string> = /* @__PURE__ */ new Set(['caption', 'col', 'colgroup', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr']);

export const HEADINGS: ReadonlySet<string> = /* @__PURE__ */ new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/** Elements whose start tag closes an open `<p>`: a paragraph holding one is split in two by HTML parsers. */
export const CLOSES_P: ReadonlySet<string> = /* @__PURE__ */ new Set([
  'blockquote', 'dd', 'dl', 'dt', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'li', 'ol', 'p', 'pre', 'table', 'ul',
]);

/** Where HTML parsers stop looking for an open list item to close: their "special" elements, less address, div and p. */
const ITEM_SCOPE: ReadonlySet<string> = /* @__PURE__ */ new Set([
  'blockquote', 'br', 'caption', 'col', 'colgroup', 'dd', 'dl', 'dt', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'img',
  'li', 'ol', 'pre', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
]);

/** Whether a new `li` (or `dd`, `dt`) under `parent` would close an open one, as HTML parsers do with `<li>` in `<li>`. */
export function closesItem(name: 'li' | 'dd' | 'dt', parent: Node | null): boolean {
  const group = name === 'li' ? ['li'] : ['dd', 'dt'];
  for (let node = parent; node !== null && node.nodeType === 1; node = node.parentNode) {
    const tag = (node as Element).localName;
    if (group.includes(tag)) return true;
    if (ITEM_SCOPE.has(tag)) return false;
  }
  return false;
}

const INTEGER = /^\d{1,4}$/;

/** Attributes kept per element (after `href` and `src`, which are checked as URLs). */
export function attributeAllowed(tag: string, name: string, value: string): boolean {
  switch (name) {
    case 'dir':
      return /^(?:ltr|rtl|auto)$/i.test(value);
    case 'lang':
      return /^[a-z]{2,3}(?:-[a-z\d]{1,8})*$/i.test(value);
    case 'title':
      // Images write their own title, alt, size and source.
      return ['a', 'abbr', 'dfn'].includes(tag);
    case 'colspan':
    case 'rowspan':
      return (tag === 'td' || tag === 'th') && INTEGER.test(value) && Number(value) >= 1 && Number(value) <= 1000;
    case 'scope':
      return tag === 'th' && /^(?:row|col|rowgroup|colgroup)$/i.test(value);
    case 'span':
      return (tag === 'col' || tag === 'colgroup') && INTEGER.test(value);
    case 'start':
      return tag === 'ol' && /^-?\d{1,9}$/.test(value);
    case 'reversed':
      return tag === 'ol';
    case 'type':
      return tag === 'ol' && /^[1aAiI]$/.test(value);
    case 'value':
      return tag === 'li' && /^-?\d{1,9}$/.test(value);
    case 'datetime':
      return tag === 'time' && /^[\d\-:T.+ Z]{1,40}$/.test(value);
    default:
      return false;
  }
}
