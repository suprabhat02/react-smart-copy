// Fails unless the npm on PATH is at least the given version (default 11.5.1, the
// first with trusted publishing). The release job uses the npm bundled with Node,
// so nothing is installed globally from the network at release time.
// Usage: node scripts/check-npm-version.js [minimum]
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const minimum = process.argv[2] ?? '11.5.1';
const actual = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
const parse = (version) => version.split('-')[0].split('.').map(Number);
const [a, b] = [parse(actual), parse(minimum)];
const order = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
if (Number.isNaN(order) || order < 0) {
  console.error(`::error::npm ${actual} is older than ${minimum}, which trusted publishing needs. Use a newer Node.js in this workflow.`);
  process.exit(1);
}
console.log(`npm ${actual} (needs ${minimum} or newer): OK`);
