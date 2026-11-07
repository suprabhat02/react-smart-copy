// Summarises the browser benchmarks (test-results/bench/<engine>.json) as a Markdown table:
// `node scripts/bench-report.mjs`. In GitHub Actions it also writes the job summary.
import { appendFile, readdir, readFile } from 'node:fs/promises';
import process from 'node:process';

const dir = 'test-results/bench';
const engines = (await readdir(dir)).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5)).sort();
if (engines.length === 0) throw new Error(`No results in ${dir}: run npm run bench:browser first.`);
const results = Object.fromEntries(await Promise.all(engines.map(async (engine) => [engine, JSON.parse(await readFile(`${dir}/${engine}.json`, 'utf8'))])));
const ids = [...new Set(engines.flatMap((engine) => Object.keys(results[engine])))];
const cell = (timing) => (timing === undefined ? '—' : `${timing.median} ms`);
const lines = [
  `| Scenario | ${engines.join(' | ')} |`,
  `| --- | ${engines.map(() => '---:').join(' | ')} |`,
  ...ids.map((id) => `| ${id} | ${engines.map((engine) => cell(results[engine][id])).join(' | ')} |`),
];
const table = `${lines.join('\n')}\n\nMedian of 7 runs after 2 warm-up runs, on the built package.\n`;
process.stdout.write(table);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Browser benchmarks\n\n${table}`);
