/**
 * URL safety for pasted links and images. Only absolute URLs with an allowed
 * scheme survive; everything else (`javascript:`, `data:`, `vbscript:`,
 * relative links without a base, malformed URLs) is dropped and the visible
 * text is kept. Parsing uses the WHATWG URL parser, the same one the browser
 * uses when the link is clicked, so tricks like `java\tscript:` are seen as
 * `javascript:`.
 */

export const DEFAULT_LINK_PROTOCOLS: readonly string[] = ['http:', 'https:', 'mailto:'];
export const DEFAULT_IMAGE_PROTOCOLS: readonly string[] = ['https:', 'http:'];

function parse(raw: string, base: string | undefined): URL | null {
  try {
    return new URL(raw.trim(), base);
  } catch {
    return null;
  }
}

/**
 * Click-tracking redirects that pasted links often carry: Google (Docs,
 * Search, Gmail) and Outlook Safe Links. Unwrapped only to an http(s) target.
 */
export function unwrapRedirect(url: URL): URL {
  const host = url.hostname.toLowerCase();
  const param =
    /(^|\.)google\.[a-z.]+$/.test(host) && url.pathname === '/url'
      ? (url.searchParams.get('q') ?? url.searchParams.get('url'))
      : host.endsWith('.safelinks.protection.outlook.com')
        ? url.searchParams.get('url')
        : null;
  if (param === null) return url;
  const target = parse(param, undefined);
  return target !== null && (target.protocol === 'https:' || target.protocol === 'http:') ? target : url;
}

/** The normalised URL, or `null` when it is not absolute or its scheme is not allowed. */
export function safeUrl(raw: string, protocols: readonly string[], base: string | undefined): string | null {
  const parsed = parse(raw, base);
  if (parsed === null) return null;
  const url = unwrapRedirect(parsed);
  return protocols.includes(url.protocol) ? url.href : null;
}

/** `href` comes from the URL serialiser, which already percent-encodes every non-ASCII character. */
const percent = (char: string): string => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`;

/**
 * A Markdown link destination. ASCII whitespace, `<`, `>` and controls are
 * percent-encoded (opaque URLs such as `mailto:` keep them otherwise),
 * backslashes too so they can't act as escapes, and parentheses are kept
 * exact by using the `<…>` form.
 */
export function linkDestination(href: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what must be encoded
  const encoded = href.replace(/[ <>\\\u0000-\u001f\u007f]/g, percent);
  return /[()]/.test(encoded) ? `<${encoded}>` : encoded;
}
