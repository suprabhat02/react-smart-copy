/**
 * Parsing HTML text that came from outside (the clipboard, a drop, a caller): shared by the
 * opt-in entry points. Internal: not part of `react-smart-copy/core`'s public API.
 */

/** A `NodeFilter.SHOW_ELEMENT`, without needing the global. */
const SHOW_ELEMENT = 1;

/**
 * Parses HTML text into an inert document: scripts and event handlers never run, and nothing is
 * fetched. Its nodes are only read, never inserted into a page.
 *
 * Event handler attributes (`onerror`, `onclick`, ...) are also removed at once, so no node of
 * the document carries one, whatever reads it later.
 *
 * With a Content Security Policy that blocks inline handlers, Chromium (since 156) reports a
 * `script-src-attr` violation, targeting the Document, for each handler it parses into an inert
 * document, though the handler never runs (w3c/webappsec-csp#824). No parser can avoid that report.
 *
 * Needs `DOMParser`: callers check for it first.
 */
export function parseInertHtml(html: string): Document {
  // Inert: CodeQL's js/xss sees DOMParser as a sink, so this file is left out of its analysis (codeql.yml).
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
