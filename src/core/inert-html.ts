/**
 * Parsing HTML text that came from outside (the clipboard, a drop, a caller): shared by the
 * opt-in entry points. Internal: not part of `react-smart-copy/core`'s public API.
 */

/** A `NodeFilter.SHOW_ELEMENT`, without needing the global. */
const SHOW_ELEMENT = 1;

/**
 * Parses HTML text into an inert document: scripts never run and nothing is fetched. Its nodes
 * are only read, never inserted into a page.
 *
 * Event handler attributes (`onerror`, `onclick`, ...) are removed at once, before any event
 * can reach them. They could never run in an inert document, but some browsers still queue an
 * image's `error` event there, and the page's Content Security Policy then reports a blocked
 * inline handler: a false alarm in a site's CSP reports for every such paste.
 *
 * Needs `DOMParser`: callers check for it first.
 */
export function parseInertHtml(html: string): Document {
  // codeql[js/xss] Parsing untrusted HTML inertly is the purpose here, not a sink: nothing is inserted into a page.
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // A tree walker, not a selector: selector engines are slow to start in DOMs like jsdom.
  const walker = doc.createTreeWalker(doc, SHOW_ELEMENT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const element = node as Element;
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.length > 2 && attribute.name.slice(0, 2).toLowerCase() === 'on') element.removeAttribute(attribute.name);
    }
  }
  return doc;
}
