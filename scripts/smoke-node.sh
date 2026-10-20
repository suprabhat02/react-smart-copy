#!/usr/bin/env bash
# Packs the built package and runs every entry point on the current Node.js, through import
# and require, from an install that sees only the package (and the repo's React, its peer).
set -euo pipefail
cd "$(dirname "$0")/.."
work=smoke-install
rm -rf "$work" && mkdir -p "$work/node_modules/react-smart-copy"
trap 'rm -rf "$work"' EXIT
tarball=$(npm pack --silent --pack-destination "$work" | tail -n 1)
tar -xzf "$work/$tarball" -C "$work/node_modules/react-smart-copy" --strip-components 1
cp scripts/smoke/checks.mjs scripts/smoke/esm.mjs scripts/smoke/cjs.cjs "$work/"
# A package of its own: inside the repo, "react-smart-copy" would otherwise resolve to the repo itself.
printf '{ "name": "smoke", "private": true }\n' > "$work/package.json"
(cd "$work" && node esm.mjs && node cjs.cjs)
