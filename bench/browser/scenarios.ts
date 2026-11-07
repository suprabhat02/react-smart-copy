/**
 * The scenarios measured in real browsers by `npm run bench:browser`: the large inputs real apps
 * meet (a 10,000-row grid, a long article, a megabyte of logs). Each runs in the page, on the
 * built package (/lib/), with its input built outside the timed part.
 *
 * `ceilingMs` is a guard, not a target: about twenty times Chromium's median when the scenario
 * was added (and several times the slowest engine's), so only a real regression (an accidental
 * quadratic loop, say) crosses it, never a slow CI machine.
 */
export interface Scenario {
  readonly id: string;
  readonly title: string;
  /** What the input is, for the report. */
  readonly input: string;
  readonly ceilingMs: number;
  /** Must run inside a click (the copy command needs a gesture). */
  readonly gesture?: boolean;
}

export const SCENARIOS: readonly Scenario[] = [
  { id: 'table-copy', title: 'Copy a grid as a table (tablePayload)', input: '10,000 rows × 8 columns', ceilingMs: 1000 },
  { id: 'table-paste-tsv', title: 'Paste from Excel (parseTable, text)', input: '10,000 rows × 8 columns, 0.6 MB', ceilingMs: 500 },
  { id: 'table-paste-html', title: 'Paste from Google Sheets (parseTable, HTML)', input: '10,000 rows × 8 columns, 1.6 MB', ceilingMs: 5000 },
  { id: 'markdown', title: 'Paste an article as Markdown (htmlToMarkdown)', input: '200 KB of HTML, 1,000 paragraphs', ceilingMs: 1000 },
  { id: 'rich', title: 'Paste an article as safe rich text (pasteToRich)', input: '200 KB of HTML, 1,000 paragraphs', ceilingMs: 1500 },
  { id: 'secrets', title: 'Check a pasted log for secrets (scanSecrets)', input: '1 MB of log lines', ceilingMs: 500 },
  { id: 'code', title: 'Check pasted code for hidden characters (inspectCode)', input: '1 MB of source', ceilingMs: 300 },
  { id: 'capture', title: 'Capture a chart as PNG (captureElement)', input: '1200 × 800 SVG, 2,000 shapes', ceilingMs: 2000 },
  { id: 'legacy-copy', title: 'Copy on plain HTTP (copy command)', input: '1 MB of text', ceilingMs: 300, gesture: true },
];
