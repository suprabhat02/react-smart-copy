// @ts-check
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A strict Content Security Policy for every built page, as a <meta> tag at the top of its <head>.
 *
 * Scripts and <style> elements run only from this site or when their exact text is hashed here,
 * so an injected inline script or stylesheet never runs. Style attributes are allowed: they
 * can't run code, and Starlight and Expressive Code set them. Search (Pagefind) runs on
 * WebAssembly, hence 'wasm-unsafe-eval'. Nothing loads from, or connects to, another origin.
 *
 * Astro's own `security.csp` leaves Starlight's `is:inline` scripts out, so the hashes are
 * computed here, from the final HTML.
 */

const hash = (text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

/** Inline scripts the browser runs (not JSON data blocks), and inline <style> elements. */
const SCRIPTS = /<script(?![^>]*\bsrc=)(?![^>]*\btype="application\/(?:ld\+)?json")[^>]*>([\s\S]*?)<\/script>/g;
const STYLES = /<style[^>]*>([\s\S]*?)<\/style>/g;

export function policy(html) {
  const scripts = [...new Set([...html.matchAll(SCRIPTS)].map((match) => hash(match[1])))].sort();
  const styles = [...new Set([...html.matchAll(STYLES)].map((match) => hash(match[1])))].sort();
  return [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval' ${scripts.join(' ')}`.trim(),
    `style-src 'self' ${styles.join(' ')}`.trim(),
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(path);
    else if (entry.name.endsWith('.html')) yield path;
  }
}

/** @returns {import('astro').AstroIntegration} */
export default function csp() {
  return {
    name: 'react-smart-copy:csp',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        let pages = 0;
        for await (const file of htmlFiles(fileURLToPath(dir))) {
          const html = await readFile(file, 'utf8');
          if (/http-equiv="content-security-policy"/i.test(html)) throw new Error(`${file} already has a CSP.`);
          const meta = `<meta http-equiv="Content-Security-Policy" content="${policy(html)}">`;
          const head = html.indexOf('<head>');
          if (head === -1) throw new Error(`${file} has no <head>.`);
          await writeFile(file, `${html.slice(0, head + 6)}${meta}${html.slice(head + 6)}`);
          pages += 1;
        }
        logger.info(`Content Security Policy written into ${String(pages)} pages.`);
      },
    },
  };
}
