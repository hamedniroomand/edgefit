// Usage: node added.mjs <base-sha>
// Prints the package names table/packages.json has that the base commit did not.
import { execFileSync } from 'node:child_process';

import { readList } from './list.mjs';

const [base] = process.argv.slice(2);
function baseNames() {
  try {
    const text = execFileSync('git', ['show', `${base}:table/packages.json`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(text).packages.map(entry => entry.name);
  } catch {
    // The base has no list yet, so every listed package is new.
    return [];
  }
}

const before = new Set(baseNames());
for (const { name } of readList()) {
  if (!before.has(name)) {
    console.log(name);
  }
}
