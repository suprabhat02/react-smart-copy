import { mkdir, writeFile } from 'node:fs/promises';
import type * as Capture from '../../src/capture';
import type * as Code from '../../src/code';
import type * as Core from '../../src/core';
import type * as Markdown from '../../src/markdown';
import type * as Rich from '../../src/rich';
import type * as Secrets from '../../src/secrets';
import type * as Table from '../../src/table';
import { expect, test, type Page } from '@playwright/test';
import { SCENARIOS, type Scenario } from './scenarios';

/** Timed runs per scenario, after two untimed warm-up runs. */
const RUNS = 7;

interface Timing {
  readonly median: number;
  readonly min: number;
  readonly max: number;
}

const results: Record<string, Timing> = {};

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await page.goto('start/quick-start/');
});

for (const scenario of SCENARIOS) {
  test(`${scenario.id}: ${scenario.title}, ${scenario.input}`, async ({ page }) => {
    const timing = await measure(page, scenario);
    results[scenario.id] = timing;
    expect(timing.median, `${scenario.id} median, ceiling ${String(scenario.ceilingMs)} ms`).toBeLessThan(scenario.ceilingMs);
  });
}

test.afterAll(async ({ browserName }) => {
  await mkdir('test-results/bench', { recursive: true });
  await writeFile(`test-results/bench/${browserName}.json`, `${JSON.stringify(results, null, 2)}\n`);
});

async function measure(page: Page, scenario: Scenario): Promise<Timing> {
  await page.evaluate(
    async ({ id, runs }) => {
      const lib = <T>(name: string): Promise<T> => import(new URL(`/lib/${name}.js`, location.href).href) as Promise<T>;
      const [table, markdown, rich, secrets, code, capture, core] = await Promise.all([
        lib<typeof Table>('table'),
        lib<typeof Markdown>('markdown'),
        lib<typeof Rich>('rich'),
        lib<typeof Secrets>('secrets'),
        lib<typeof Code>('code'),
        lib<typeof Capture>('capture'),
        lib<typeof Core>('core'),
      ]);

      // Inputs, built once: realistic shapes, not repeated single characters.
      const rows = Array.from({ length: 10_000 }, (_, index) => ({
        id: `ORD-${String(100_000 + index)}`,
        customer: `Customer ${String(index % 977)}, Ltd.`,
        city: ['Noida', 'Aarhus', 'Shanghai', 'Sydney'][index % 4] ?? '',
        amount: (index * 37.5) % 99_999,
        qty: index % 120,
        date: `2026-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 28) + 1).padStart(2, '0')}`,
        status: index % 7 === 0 ? 'Refunded' : 'Paid',
        note: index % 5 === 0 ? 'Gift wrap, "fragile"' : '',
      }));
      const columns = (['id', 'customer', 'city', 'amount', 'qty', 'date', 'status', 'note'] as const).map((key) => ({ header: key, value: key }));
      const data = table.fromRows(rows, columns);
      const tsv = table.tableToTsv(data);
      const sheetsHtml = `<google-sheets-html-origin><table>${rows
        .map((row) => `<tr>${Object.values(row).map((cell) => `<td style="font-family:Arial">${String(cell)}</td>`).join('')}</tr>`)
        .join('')}</table>`;
      const article = Array.from(
        { length: 1000 },
        (_, index) =>
          `<p style="margin:0">Paragraph ${String(index)} with <b>bold</b>, <i>italic</i> and a <a href="https://example.com/${String(index)}?utm_source=x">link</a>.</p>`,
      ).join('');
      const log = Array.from(
        { length: 9000 },
        (_, index) => `2026-11-07T06:51:${String(index % 60).padStart(2, '0')}Z INFO request ${String(index)} user=ana${String(index)}@example.com path=/api/orders/${String(index)} took=${String(index % 300)}ms`,
      )
        .join('\n')
        .slice(0, 1_000_000);
      const source = Array.from({ length: 25_000 }, (_, index) => `export const value${String(index)} = compute(${String(index)}, "x");`)
        .join('\n')
        .slice(0, 1_000_000);
      const svgNs = 'http://www.w3.org/2000/svg';
      const chart = document.createElementNS(svgNs, 'svg');
      chart.setAttribute('width', '1200');
      chart.setAttribute('height', '800');
      chart.setAttribute('viewBox', '0 0 1200 800');
      for (let index = 0; index < 2000; index += 1) {
        const bar = document.createElementNS(svgNs, 'rect');
        bar.setAttribute('x', String((index * 0.6) % 1200));
        bar.setAttribute('y', String(800 - (index % 400)));
        bar.setAttribute('width', '0.5');
        bar.setAttribute('height', String(index % 400));
        bar.setAttribute('fill', index % 2 === 0 ? '#3a6' : '#36a');
        chart.append(bar);
      }
      document.body.append(chart);
      const megabyte = 'x'.repeat(1_000_000);
      const adapter = core.createBrowserClipboardAdapter({ getEnvironment: () => ({ isSecureContext: false, navigator: {}, document }) });

      const work: Record<string, () => unknown> = {
        'table-copy': () => table.tablePayload(data),
        'table-paste-tsv': () => table.parseTable({ text: tsv }),
        'table-paste-html': () => table.parseTable({ html: sheetsHtml, text: tsv }),
        markdown: () => markdown.htmlToMarkdown(article),
        rich: () => rich.pasteToRich({ html: article }),
        secrets: () => secrets.scanSecrets(log),
        code: () => code.inspectCode(source),
        capture: () => capture.captureElement(chart),
        'legacy-copy': () => adapter.write({ kind: 'text', value: megabyte }),
      };
      const run = work[id];
      if (run === undefined) throw new Error(`No scenario ${id}`);
      const times: number[] = [];
      const state = { times, run, runs };
      (window as unknown as { __bench: typeof state }).__bench = state;
    },
    { id: scenario.id, runs: RUNS },
  );

  const runOnce = async (): Promise<void> => {
    if (scenario.gesture === true) {
      // Timed inside a real click, as a copy button runs.
      await page.evaluate(() => {
        const button = document.createElement('button');
        button.id = 'bench-run';
        button.textContent = 'run';
        button.style.cssText = 'position:fixed;inset:auto 0 0 auto;z-index:2147483647';
        button.addEventListener('click', () => {
          const bench = (window as unknown as { __bench: { times: number[]; run: () => unknown } }).__bench;
          const start = performance.now();
          void Promise.resolve(bench.run()).then(() => bench.times.push(performance.now() - start));
        });
        document.body.append(button);
      });
      const before = await page.evaluate(() => (window as unknown as { __bench: { times: number[] } }).__bench.times.length);
      await page.click('#bench-run');
      await expect.poll(() => page.evaluate(() => (window as unknown as { __bench: { times: number[] } }).__bench.times.length)).toBe(before + 1);
      await page.evaluate(() => document.querySelector('#bench-run')?.remove());
    } else {
      await page.evaluate(async () => {
        const bench = (window as unknown as { __bench: { times: number[]; run: () => unknown } }).__bench;
        const start = performance.now();
        await bench.run();
        bench.times.push(performance.now() - start);
      });
    }
  };

  for (let index = 0; index < RUNS + 2; index += 1) await runOnce();
  const all = await page.evaluate(() => (window as unknown as { __bench: { times: number[] } }).__bench.times);
  const times = all.slice(2).sort((a, b) => a - b);
  return { median: round(times[Math.floor(times.length / 2)] ?? NaN), min: round(times[0] ?? NaN), max: round(times.at(-1) ?? NaN) };
}

const round = (value: number): number => Math.round(value * 10) / 10;
