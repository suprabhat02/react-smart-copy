// Fails unless a Playwright JSON report shows at least `min` tests that all passed on
// the first try: no skipped, flaky or failed tests. Used by CI after each browser run.
import { readFileSync } from 'node:fs';
import process from 'node:process';

const [file, min] = process.argv.slice(2);
const { stats } = JSON.parse(readFileSync(file, 'utf8'));
const problems = [];
if (stats.expected < Number(min)) problems.push(`${String(stats.expected)} tests passed, expected at least ${min}`);
if (stats.skipped > 0) problems.push(`${String(stats.skipped)} skipped`);
if (stats.flaky > 0) problems.push(`${String(stats.flaky)} flaky`);
if (stats.unexpected > 0) problems.push(`${String(stats.unexpected)} failed`);
if (problems.length > 0) {
  console.error(`check-report: ${problems.join('; ')}.`);
  process.exit(1);
}
console.log(`check-report: ${String(stats.expected)} tests ran and passed.`);
