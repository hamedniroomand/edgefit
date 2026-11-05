import { describe, expect, it } from 'vite-plus/test';

import { extractUsages } from '@/extract/index.ts';

const run = (source: string): string[] =>
  extractUsages('lib.cjs', source, {
    globals: new Set(['process']),
    nodeEnv: undefined,
    imported: true,
  }).map(usage => usage.display);

// The engine limit for call arguments is about 120,000 to 200,000.
const count = 300_000;
const elements = Array.from({ length: count }, (_, index) => String(index)).join(',');

describe('wide literals', () => {
  it('scans a file with a 300,000 element array', () => {
    expect(
      run(
        `const cp = require('node:child_process');\nconst table = [${elements}];\ncp.spawn('x');`,
      ),
    ).toContain('node:child_process.spawn');
  });

  it('scans a file with a 300,000 argument call', () => {
    expect(
      run(`const cp = require('node:child_process');\nf(${elements});\ncp.spawn('x');`),
    ).toContain('node:child_process.spawn');
  });
});
