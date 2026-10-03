import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { Loader, Plugin } from 'esbuild';
import type { Node } from 'oxc-parser';

import { findImportWrappers } from '@/extract/import-wrappers.ts';
import { parse } from '@/extract/index.ts';

const loaders: Record<string, Loader> = {
  '.ts': 'ts',
  '.mts': 'ts',
  '.cts': 'ts',
  '.tsx': 'tsx',
  '.jsx': 'jsx',
};

// A file that holds `import(` can hold a wrapper. Most files do not, so most are not parsed.
// oxlint-disable-next-line require-unicode-regexp
const importCall = /import\s*\(/;

/**
 * esbuild only follows an `import()` with a literal. A call of a function that only runs
 * `import(specifier)`, such as `load('pkg')`, would leave `pkg` out of the graph. This adds
 * `import('pkg')` after the code of the file. The output of the build is not used, and the
 * positions in the file do not change.
 */
export const importWrappers: Plugin = {
  name: 'edgefit-import-wrappers',
  setup(build) {
    // esbuild compiles filters as Go regular expressions, which reject the `u` flag.
    // oxlint-disable-next-line require-unicode-regexp
    build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, args => {
      const source = readFileSync(args.path, 'utf8');
      if (!importCall.test(source)) {
        return;
      }
      const result = parse(args.path, source);
      const { calls } = findImportWrappers(result.program.body as Node[]);
      if (result.errors.length > 0 || calls.size === 0) {
        return;
      }
      const added = [...new Set(calls.values())].map(item => `import(${JSON.stringify(item)});`);
      return {
        contents: `${source}\n${added.join('\n')}\n`,
        loader: loaders[path.extname(args.path)] ?? 'js',
        resolveDir: path.dirname(args.path),
      };
    });
  },
};
