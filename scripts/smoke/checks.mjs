// Runs every entry point of the packed package on the current Node.js, without a DOM:
// it loads, its pure functions work, and DOM-only features fail with a typed error.
// Shared by esm.mjs (import) and cjs.cjs (require). Run by the "Node.js" job in CI.

import assert from 'node:assert/strict';

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
  0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 3, 0, 0, 0, 2, 8, 6, 0, 0, 0, 0, 0, 0, 0, // IHDR: 3 x 2
  0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82, // IEND
]);

/** @param {(entry: string) => Promise<Record<string, any>>} load */
export async function run(load, label) {
  const checks = {
    '': async (m) => {
      assert.equal(typeof m.useCopy, 'function');
      assert.equal(typeof m.usePaste, 'function');
      assert.equal(m.copyFailure('timeout', 'x').copyError.type, 'timeout');
    },
    '/core': async (m) => {
      const failure = m.copyFailure('timeout', 'Too slow.');
      assert.ok(failure instanceof Error);
      assert.ok(m.isCopyFailure(failure));
      assert.equal(failure.copyError.type, 'timeout');
    },
    '/table': async (m) => {
      const parsed = m.parseDelimited('a\tb\n1\t2');
      assert.deepEqual(parsed.rows, [['a', 'b'], ['1', '2']]);
      // Excel's own line endings.
      assert.equal(m.tableToTsv({ rows: parsed.rows }), 'a\tb\r\n1\t2');
    },
    '/structured': async (m) => {
      const format = m.defineClipFormat({ id: 'smoke.point', schema: { '~standard': { version: 1, vendor: 'smoke', validate: (value) => ({ value }) } } });
      const payload = m.clipPayload(format, { x: 1 });
      assert.equal(typeof payload, 'object');
    },
    '/markdown': async (m) => {
      assert.equal(m.escapeMarkdown('*a*'), '\\*a\\*');
      // HTML text needs a DOM parser: a typed error on Node.js, never a crash.
      assert.throws(() => m.htmlToMarkdown('<b>a</b>'), (error) => error.copyError?.type === 'unsupported');
    },
    '/code': async (m) => {
      assert.equal(m.normalizeCode('  a\n  b'), 'a\nb');
      assert.equal(m.cleanCode('a\u200bb').code, 'ab');
      assert.equal(m.inspectCode('const a = 1;').findings.length, 0);
      assert.ok(m.inspectCode('const a\u202E = 1;').findings.length > 0);
    },
    '/image': async (m) => {
      const info = await m.readImageInfo(new Blob([PNG]));
      assert.equal(info.format, 'png');
      assert.equal(info.width, 3);
      assert.equal(info.height, 2);
    },
    '/link': async (m) => {
      assert.equal(m.cleanLinkUrl('https://example.com/a?utm_source=x&id=1'), 'https://example.com/a?id=1');
    },
    '/share': async (m) => {
      assert.equal(typeof m.shareOrCopy, 'function');
      assert.equal(typeof m.shareMethod(), 'string');
    },
    '/color': async (m) => {
      assert.equal(m.formatColor('#3b82f6', 'oklch'), 'oklch(62.31% 0.18801 259.81)');
      assert.equal(m.formatColor('color(display-p3 1 1 1)', 'hsl'), 'hsl(0 0% 100%)');
      assert.equal(m.contrastRatio('#000000', '#ffffff'), 21);
    },
    '/rich': async (m) => {
      assert.throws(() => m.prepareRich('<b>a</b>'), (error) => error.copyError?.type === 'unsupported');
      // Pasting needs no DOM for plain text, the fallback for HTML without one.
      assert.equal(m.pasteToRich({ html: '<b>a</b>', text: 'a\nb' }).html, '<p>a<br>b</p>');
    },
    '/files': async (m) => {
      // Node.js 18 has Blob but no File (uploads are typed Blobs there), and no global Web Crypto.
      const webCrypto = typeof globalThis.crypto?.subtle === 'object';
      const sources = [new Blob([PNG]), new Blob([new Uint8Array([0x4d, 0x5a])])];
      const { accepted, rejected } = await m.acceptFiles(sources, { digest: webCrypto });
      assert.equal(accepted.length, 1);
      assert.equal(accepted[0].type, 'image/png');
      assert.equal(accepted[0].upload.type, 'image/png');
      assert.deepEqual(rejected[0].risks, ['executable']);
      if (webCrypto) assert.match(accepted[0].sha256, /^[0-9a-f]{64}$/);
      else await assert.rejects(m.acceptFiles(sources, { digest: true }), (error) => error.copyError?.type === 'unsupported');
      assert.equal(m.safeFileName('../CON.txt'), '_CON.txt');
    },
    '/secrets': async (m) => {
      // A fake token, built here so no file holds one.
      const token = ['gh', 'p_', 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'].join('');
      assert.deepEqual(m.scanSecrets(`token=${token}`).findings.map((finding) => finding.kind), ['github-token']);
      assert.equal(m.redactSecrets(`card 4242 4242 4242 4242`).text, 'card [redacted card number]');
    },
    '/otp': async (m) => {
      assert.deepEqual(m.extractOtp('Your verification code is 482913. It expires in 10 minutes.'), {
        code: '482913',
        source: 'keyword',
        confidence: 'high',
        domain: null,
      });
      assert.equal(m.extractOtp('Total: $1234, order 5678'), null);
      const field = m.createOtpField({ length: 4 });
      field.setValue('48-29');
      assert.equal(field.getSnapshot().value, '4829');
    },
    '/capture': async (m) => {
      assert.deepEqual(m.readSvgSize('<svg width="4" height="5"></svg>'), { width: 4, height: 5 });
    },
    '/testing': async (m) => {
      const mock = m.createMockClipboardAdapter();
      mock.queueSuccess();
      await mock.adapter.write({ kind: 'text', text: 'hi' }, {});
      assert.equal(mock.writeCount(), 1);
      assert.deepEqual(mock.lastPayload(), { kind: 'text', text: 'hi' });
    },
  };
  for (const [entry, check] of Object.entries(checks)) {
    const name = `react-smart-copy${entry}`;
    try {
      const loaded = await load(entry);
      await check(loaded);
    } catch (error) {
      console.error(`${label}: ${name} failed on Node.js ${process.version}`);
      throw error;
    }
  }
  // One core for every entry point: the same CopyFailure class, whichever entry made the failure.
  const { CopyFailure } = await load('/core');
  assert.equal((await load('')).CopyFailure, CopyFailure, 'react-smart-copy and react-smart-copy/core share CopyFailure');
  assert.equal((await load('/testing')).CopyFailure, CopyFailure, 'react-smart-copy/testing shares CopyFailure');
  for (const [entry, fail] of [
    ['/markdown', (m) => m.htmlToMarkdown('<b>a</b>')],
    ['/rich', (m) => m.prepareRich('<b>a</b>')],
    ['/color', (m) => m.formatColor('#fff', 'nope')],
  ]) {
    const module = await load(entry);
    assert.throws(() => fail(module), (error) => error instanceof CopyFailure, `react-smart-copy${entry} throws the shared CopyFailure`);
  }
  console.log(`${label}: all ${String(Object.keys(checks).length)} entry points work on Node.js ${process.version}, with one shared core.`);
}
