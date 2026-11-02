import { parseAddresses } from '../../src/email';
import { readLink } from '../../src/link';
import { pasteToMarkdown } from '../../src/markdown';
import { parseNumber } from '../../src/number';
import { extractOtp } from '../../src/otp';
import { pasteToRich } from '../../src/rich';
import { scanSecrets } from '../../src/secrets';
import { parseTable } from '../../src/table';
import { pasteToCode } from '../../src/code';
import type { Capture } from './schema';

/** What a converter made of a capture: its result, `null` for "nothing to convert", or the error type it threw. */
export type Outcome = unknown;

/** The converters the corpus runs, by name. A new converter is one line here. */
const CONVERTERS: Readonly<Record<string, (html: string | null, text: string | null, uriList: string | null) => Outcome>> = {
  markdown: (html, text) => pasteToMarkdown({ html, text }),
  rich: (html, text) => pasteToRich({ html, text }),
  table: (html, text) => parseTable({ html, text }),
  code: (html, text) => pasteToCode({ html, text }),
  link: (html, text, uriList) => readLink({ html, text, uriList }),
  number: (_html, text) => (text === null ? null : parseNumber(text.trim())),
  addresses: (_html, text) => (text === null ? null : parseAddresses(text)),
  otp: (_html, text) => (text === null ? null : extractOtp(text)),
  secrets: (_html, text) => (text === null ? null : scanSecrets(text).findings.map(({ kind, confidence }) => ({ kind, confidence }))),
};

/** The error type of a `CopyFailure`, or the error's name: a converter must throw only the former. */
function failureOf(error: unknown): { readonly threw: string } {
  const type = (error as { copyError?: { type?: unknown } } | null)?.copyError?.type;
  return { threw: typeof type === 'string' ? type : `UNTYPED ${error instanceof Error ? error.name : typeof error}` };
}

/**
 * Runs every converter on a capture's flavours, and gives the results as plain data, ready
 * to compare with the recorded ones. A converter that throws is recorded, not rethrown.
 */
export function runCorpus(capture: Capture): Record<string, Outcome> {
  const html = capture.types['text/html'] ?? null;
  const text = capture.types['text/plain'] ?? null;
  const uriList = capture.types['text/uri-list'] ?? null;
  const results: Record<string, Outcome> = {};
  for (const [name, convert] of Object.entries(CONVERTERS)) {
    try {
      results[name] = convert(html, text, uriList);
    } catch (error) {
      results[name] = failureOf(error);
    }
  }
  // Plain data only, in the order written: what is recorded is what is compared.
  return JSON.parse(JSON.stringify(results, (_key, value: unknown) => (value === undefined ? null : value))) as Record<string, Outcome>;
}
