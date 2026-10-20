// A dependency-free static server for the end-to-end tests: the built docs (docs/dist) at the path
// GitHub Pages serves them from, the built package at /lib/, and the image fixtures.
import { createServer } from 'node:http';
import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.E2E_PORT ?? 4173);
/** URL prefix to directory: the docs, the built package, and the fixtures. */
const MOUNTS = [
  ['/react-smart-copy/', 'docs/dist'],
  ['/lib/', 'dist'],
  ['/e2e-fixtures/', 'e2e/fixtures'],
];
const TYPES = {
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.mjs': 'text/javascript; charset=utf-8',
};

createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const mount = MOUNTS.find(([prefix]) => path.startsWith(prefix));
  if (mount === undefined) {
    response.writeHead(404).end('Not found');
    return;
  }
  const [prefix, base] = mount;
  const rest = path.slice(prefix.length);
  const root = join(ROOT, base);
  const file = normalize(join(root, rest.endsWith('/') || rest === '' ? `${rest}index.html` : rest));
  if (!file.startsWith(root)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch {
    // As GitHub Pages does: the site's own 404 page.
    const notFound = await readFile(join(ROOT, 'docs/dist/404.html')).catch(() => 'Not found');
    response.writeHead(404, { 'content-type': TYPES['.html'] }).end(notFound);
  }
}).listen(PORT, '127.0.0.1');
