// Records what the converters make of every capture in test/corpus/captures as the accepted
// result, for a reviewer to read in the diff. Usage: npm run corpus:accept
import { spawnSync } from 'node:child_process';

const run = spawnSync('npx', ['vitest', 'run', 'test/corpus'], {
  stdio: 'inherit',
  env: { ...process.env, CORPUS_ACCEPT: '1' },
  shell: process.platform === 'win32',
});
process.exit(run.status ?? 1);
