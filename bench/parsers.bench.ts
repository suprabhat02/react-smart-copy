/**
 * Benchmarks for the parsers people call most: `npm run bench`. Each module compares typical
 * input with hostile input at the module's limit, so both the everyday cost and the worst case
 * show. Inputs are built once, outside the measured functions. Run on the built package, as
 * apps load it (`npm run bench` builds first), in jsdom (the HTML parsers need a DOM).
 */
import { test } from 'vitest';
import { inspectCode } from 'react-smart-copy/code';
import { parseColor } from 'react-smart-copy/color';
import { ADDRESS_LIST_MAX_LENGTH, parseAddresses } from 'react-smart-copy/email';
import { htmlToMarkdown } from 'react-smart-copy/markdown';
import { NUMBER_MAX_LENGTH, parseNumber } from 'react-smart-copy/number';
import { extractOtp, OTP_SCAN_LENGTH } from 'react-smart-copy/otp';
import { scanSecrets } from 'react-smart-copy/secrets';
import { parseTable } from 'react-smart-copy/table';

/** `text` repeated to exactly `length` characters. */
const repeat = (text: string, length: number): string => text.repeat(Math.ceil(length / text.length)).slice(0, length);

test('react-smart-copy/number', async ({ bench }) => {
  const hostile = repeat('1,', NUMBER_MAX_LENGTH);
  await bench.compare(
    bench('parseNumber: an amount', () => {
      parseNumber('1.234.567,89 \u20AC', { locale: 'de-DE' });
    }),
    bench('parseNumber: hostile, at its limit', () => {
      parseNumber(hostile);
    }),
  );
});

test('react-smart-copy/email', async ({ bench }) => {
  const list = Array.from({ length: 100 }, (_, index) => `"Lima, Ana ${String(index)}" <ana${String(index)}@example.com>`).join('; ');
  const hostile = repeat('"<(@', ADDRESS_LIST_MAX_LENGTH);
  await bench.compare(
    bench('parseAddresses: 100 recipients', () => {
      parseAddresses(list);
    }),
    bench('parseAddresses: hostile, at its limit', () => {
      parseAddresses(hostile);
    }),
  );
});

test('react-smart-copy/otp', async ({ bench }) => {
  const hostile = repeat('code 12 34 ', OTP_SCAN_LENGTH);
  await bench.compare(
    bench('extractOtp: an SMS', () => {
      extractOtp('Your verification code is 482913. It expires in 10 minutes. Do not share it.');
    }),
    bench('extractOtp: hostile, at its limit', () => {
      extractOtp(hostile);
    }),
  );
});

test('react-smart-copy/secrets', async ({ bench }) => {
  const config = ['AWS_REGION=eu-west-1', 'DATABASE_URL=postgres://app:hunter2hunter2@db.internal:5432/app', 'LOG_LEVEL=debug'].join('\n');
  const logs = repeat('10:02:11 INFO request served in 12 ms by worker-3\n', 100_000);
  await bench.compare(
    bench('scanSecrets: a config file', () => {
      scanSecrets(config);
    }),
    bench('scanSecrets: 100,000 characters of logs', () => {
      scanSecrets(logs);
    }),
  );
});

test('react-smart-copy/table', async ({ bench }) => {
  const rows = (count: number): string =>
    Array.from({ length: count }, (_, row) => Array.from({ length: 10 }, (_, column) => `r${String(row)}c${String(column)}`).join('\t')).join('\n');
  const small = rows(20);
  const large = rows(1000);
  await bench.compare(
    bench('parseTable: 20 rows by 10 columns', () => {
      parseTable({ text: small });
    }),
    bench('parseTable: 1,000 rows by 10 columns', () => {
      parseTable({ text: large });
    }),
  );
});

test('react-smart-copy/markdown', async ({ bench }) => {
  const paragraph = '<p>Some <b>bold</b> and <a href="https://example.com">a link</a>.</p><ul><li>One</li><li>Two</li></ul>';
  const page = repeat(paragraph, 50_000);
  await bench.compare(
    bench('htmlToMarkdown: a paragraph and a list', () => {
      htmlToMarkdown(paragraph);
    }),
    bench('htmlToMarkdown: 50 kB of pasted HTML', () => {
      htmlToMarkdown(page);
    }),
  );
});

test('react-smart-copy/code', async ({ bench }) => {
  const line = 'const total = items.reduce((sum, item) => sum + item.price, 0);\n';
  const file = repeat(line, 100_000);
  await bench.compare(
    bench('inspectCode: a line', () => {
      inspectCode(line);
    }),
    bench('inspectCode: 100 kB of code', () => {
      inspectCode(file);
    }),
  );
});

test('react-smart-copy/color', async ({ bench }) => {
  await bench.compare(
    bench('parseColor: hex', () => {
      parseColor('#3b82f6');
    }),
    bench('parseColor: oklch()', () => {
      parseColor('oklch(62.3% 0.188 259.8)');
    }),
  );
});
