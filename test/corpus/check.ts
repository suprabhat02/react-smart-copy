import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { privacyProblems } from './privacy';
import { runCorpus } from './run';
import { captureProblems, type Capture } from './schema';

const SUFFIX = '.capture.json';

/** Everything wrong with the corpus in `captures` and `expected`; with `accept`, results are (re)written first. */
export function checkCorpus(captures: string, expected: string, accept = false): string[] {
  const problems: string[] = [];
  const ids = readdirSync(captures).filter((name) => name.endsWith(SUFFIX)).map((name) => name.slice(0, -SUFFIX.length)).sort();
  if (accept) mkdirSync(expected, { recursive: true });
  for (const id of ids) {
    let capture: Capture;
    try {
      capture = JSON.parse(readFileSync(join(captures, `${id}${SUFFIX}`), 'utf8')) as Capture;
    } catch {
      problems.push(`${id}: is not valid JSON`);
      continue;
    }
    const wrong = [...captureProblems(capture, id), ...privacyProblems(capture)];
    if (wrong.length > 0) {
      problems.push(...wrong.map((problem) => `${id}: ${problem}`));
      continue;
    }
    const results = runCorpus(capture);
    for (const [converter, result] of Object.entries(results)) if (JSON.stringify(result).includes('UNTYPED')) problems.push(`${id}: ${converter} threw an error that is not a CopyFailure`);
    const file = join(expected, `${id}.json`);
    if (accept) writeFileSync(file, `${JSON.stringify(results, null, 2)}\n`);
    if (!existsSync(file)) problems.push(`${id}: no accepted result; run "npm run corpus:accept" and review it`);
    else if (JSON.stringify(results) !== JSON.stringify(JSON.parse(readFileSync(file, 'utf8')))) problems.push(`${id}: converts differently from the accepted result (${id}.json)`);
  }
  if (existsSync(expected)) {
    for (const name of readdirSync(expected).filter((file) => file.endsWith('.json'))) {
      if (!ids.includes(name.slice(0, -'.json'.length))) problems.push(`${name}: an accepted result without a capture`);
    }
  }
  return problems;
}
