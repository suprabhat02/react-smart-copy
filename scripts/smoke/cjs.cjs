// The CommonJS build, loaded with require().
// The packed package, not the repo: fail loudly if resolution ever finds anything else.
const resolved = require.resolve('react-smart-copy/package.json');
if (!resolved.includes('/node_modules/react-smart-copy/')) throw new Error(`Resolved the wrong package: ${resolved}`);

import('./checks.mjs')
  .then(({ run }) => run(async (entry) => require(`react-smart-copy${entry}`), 'require'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
