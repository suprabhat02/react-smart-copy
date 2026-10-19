import { copyFailure } from '../core/errors';

/** Schemes a copied or pasted link may use by default. Never `javascript:`, `data:`, `vbscript:` or `file:`. */
export const DEFAULT_LINK_PROTOCOLS: readonly string[] = Object.freeze(['https:', 'http:', 'mailto:', 'tel:']);

/**
 * Query parameters that only track where a click came from: the defaults of
 * {@link cleanLinkUrl}. `utm_` matches every parameter starting with it.
 */
export const TRACKING_PARAMETERS: readonly string[] = Object.freeze([
  'utm_',
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'yclid',
  'twclid',
  'ttclid',
  'li_fat_id',
  'igshid',
  'igsh',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  'mkt_tok',
  'oly_anon_id',
  'oly_enc_id',
  'vero_id',
  'wickedid',
  '_gl',
]);

export interface CleanLinkOptions {
  /**
   * Parameters to remove: exact names, names ending in `_` (a prefix, like
   * `utm_`), or regular expressions tested against the name. Default {@link TRACKING_PARAMETERS}.
   */
  readonly params?: readonly (string | RegExp)[];
  /** Parameters never removed, even when `params` matches them. */
  readonly keep?: readonly string[];
}

export interface LinkUrlOptions {
  /** Resolves relative links. Default: the page's address in a browser; required elsewhere for relative links. */
  readonly base?: string | URL;
  /** Allowed schemes, with the colon. Default {@link DEFAULT_LINK_PROTOCOLS}. */
  readonly protocols?: readonly string[];
  /** Remove tracking parameters: `true` for {@link TRACKING_PARAMETERS}, or your own list. Default `false`. */
  readonly clean?: boolean | CleanLinkOptions;
}

const invalid = (message: string) => copyFailure('invalid-payload', message);

function baseUrl(base: LinkUrlOptions['base']): string | undefined {
  if (base !== undefined) {
    if (typeof base === 'string' || base instanceof URL) return String(base);
    throw invalid('`base` must be a string or a URL.');
  }
  return typeof location === 'undefined' ? undefined : location.href;
}

function protocolSet(protocols: LinkUrlOptions['protocols']): ReadonlySet<string> {
  const list: unknown = protocols ?? DEFAULT_LINK_PROTOCOLS;
  const valid = (protocol: unknown): protocol is string => typeof protocol === 'string' && /^[a-z][a-z\d+.-]*:$/i.test(protocol);
  if (!Array.isArray(list) || list.length === 0 || !(list as readonly unknown[]).every(valid)) {
    throw invalid('`protocols` must be a non-empty list of schemes with their colon, like "https:".');
  }
  return new Set((list as readonly string[]).map((protocol) => protocol.toLowerCase()));
}

function matcher(params: CleanLinkOptions['params']): (name: string) => boolean {
  const list = params ?? TRACKING_PARAMETERS;
  if (!Array.isArray(list) || !list.every((param) => typeof param === 'string' || param instanceof RegExp)) {
    throw invalid('`clean.params` must be a list of strings and regular expressions.');
  }
  return (name) => {
    const lower = name.toLowerCase();
    return list.some((param) => {
      if (typeof param !== 'string') return new RegExp(param.source, param.flags.replace(/[gy]/g, '')).test(name);
      const wanted = param.toLowerCase();
      return wanted.endsWith('_') ? lower.startsWith(wanted) : lower === wanted;
    });
  };
}

/** The cleaning step `clean` asks for, or `null`. Throws for an invalid option. */
function cleaner(option: LinkUrlOptions['clean']): ((url: URL) => void) | null {
  const cleaning: unknown = option ?? false; // Plain-JS callers can pass anything.
  if (cleaning === false) return null;
  if (cleaning !== true && (typeof cleaning !== 'object' || cleaning === null)) throw invalid('`clean` must be a boolean or an options object.');
  const settings: CleanLinkOptions = cleaning === true ? {} : cleaning;
  const tracking = matcher(settings.params);
  const keep = settings.keep ?? [];
  if (!Array.isArray(keep) || !keep.every((name: unknown) => typeof name === 'string')) throw invalid('`clean.keep` must be a list of strings.');
  const kept = new Set(keep.map((name) => name.toLowerCase()));
  return (url) => {
    for (const name of [...new Set(url.searchParams.keys())]) {
      if (tracking(name) && !kept.has(name.toLowerCase())) url.searchParams.delete(name);
    }
  };
}

/**
 * Validates `options` once (throwing a typed `invalid-payload` error for invalid
 * ones) and returns a resolver that throws only for invalid links.
 * @internal
 */
export function linkUrlResolver(options: LinkUrlOptions = {}): (input: string | URL) => string {
  const protocols = protocolSet(options.protocols);
  const base = baseUrl(options.base);
  const clean = cleaner(options.clean);
  return (input) => {
    if (typeof input !== 'string' && !(input instanceof URL)) throw invalid('A link must be a string or a URL.');
    const raw = String(input).trim();
    if (raw === '') throw invalid('A link must not be empty.');
    let url: URL;
    try {
      url = new URL(raw, base);
    } catch (cause) {
      throw copyFailure('invalid-payload', `Not a valid link: ${JSON.stringify(raw.slice(0, 200))}.`, cause);
    }
    if (!protocols.has(url.protocol)) {
      throw invalid(`Links with the scheme "${url.protocol}" are not allowed (allowed: ${[...protocols].join(', ')}).`);
    }
    // Never copy or paste credentials embedded in a link.
    url.username = '';
    url.password = '';
    clean?.(url);
    return url.href;
  };
}

/**
 * The link as an absolute, safe URL string, or a typed `invalid-payload` error:
 * relative links are resolved, the scheme must be allowed, user names and
 * passwords are always removed, and tracking parameters optionally.
 */
export function resolveLinkUrl(input: string | URL, options: LinkUrlOptions = {}): string {
  return linkUrlResolver(options)(input);
}

/**
 * Removes tracking parameters (`utm_*`, `fbclid`, `gclid`, ...) from a link, keeping
 * everything else, including the fragment. Also validates it like every link here.
 *
 * @example
 * cleanLinkUrl('https://shop.example/p/42?utm_source=news&color=red'); // 'https://shop.example/p/42?color=red'
 */
export function cleanLinkUrl(url: string | URL, options: CleanLinkOptions & Omit<LinkUrlOptions, 'clean'> = {}): string {
  const { params, keep, ...rest } = options;
  return resolveLinkUrl(url, { ...rest, clean: { ...(params === undefined ? {} : { params }), ...(keep === undefined ? {} : { keep }) } });
}
