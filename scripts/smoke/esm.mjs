import { createRequire } from 'node:module';
import { run } from './checks.mjs';

// The packed package, not the repo: fail loudly if resolution ever finds anything else.
const resolved = createRequire(import.meta.url).resolve('react-smart-copy/package.json');
if (!resolved.includes('/node_modules/react-smart-copy/')) throw new Error(`Resolved the wrong package: ${resolved}`);

await run((entry) => import(`react-smart-copy${entry}`), 'import');
