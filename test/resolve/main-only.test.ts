import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { resolveGraph } from '@/resolve/graph.ts';
import type { ModuleGraph } from '@/resolve/graph.ts';

const cli = 'src/cli.cjs';

async function graphOf(
  files: Record<string, string>,
  entries = ['src/index.js'],
): Promise<ModuleGraph> {
  const root = mkdtempSync(path.join(tmpdir(), 'edgefit-main-only-'));
  mkdirSync(path.join(root, 'src'));
  for (const [name, code] of Object.entries({ [cli]: 'module.exports = 2;\n', ...files })) {
    writeFileSync(path.join(root, name), code);
  }
  const graph = await resolveGraph({
    root,
    entries,
    conditions: [],
    platform: 'node',
    nodeEnv: undefined,
  });
  return graph;
}

const lib = (code: string): Record<string, string> => ({
  'src/index.js': "import lib from './lib.cjs';\nexport default lib;\n",
  'src/lib.cjs': `module.exports = 1;\n${code}\n`,
});

describe('a require behind require.main === module, in the module graph', () => {
  it.each([
    ["if (require.main === module) require('./cli.cjs');"],
    ["if (module === require.main) { require('./cli.cjs'); }"],
    ["require.main === module && require('./cli.cjs');"],
    ["if (require.main === module) require('./cli.cjs'); else module.exports = 3;"],
  ])('does not load the module of %s', async code => {
    const graph = await graphOf(lib(code));
    expect(graph.modules.has(cli)).toBe(false);
  });

  it('keeps the require of the else branch', async () => {
    const graph = await graphOf(lib("if (require.main === module) {} else require('./cli.cjs');"));
    expect(graph.modules.has(cli)).toBe(true);
  });

  it('keeps a module that another require loads', async () => {
    const graph = await graphOf(
      lib("if (require.main === module) require('./cli.cjs');\nrequire('./cli.cjs');"),
    );
    expect(graph.modules.has(cli)).toBe(true);
  });

  it('keeps the module of a file that is an entry', async () => {
    const graph = await graphOf(lib("if (require.main === module) require('./cli.cjs');"), [
      'src/lib.cjs',
    ]);
    expect(graph.modules.has(cli)).toBe(true);
  });

  it.each([
    ["if (require.main !== module) module.exports = 3; else require('./cli.cjs');"],
    ["require.main !== module || require('./cli.cjs');"],
  ])('does not load the module of %s', async code => {
    const graph = await graphOf(lib(code));
    expect(graph.modules.has(cli)).toBe(false);
  });

  it.each([
    ["if (require.main !== module) require('./cli.cjs');"],
    ["require.main === module || require('./cli.cjs');"],
    ["if (require.main === other) require('./cli.cjs');"],
  ])('keeps the module of %s', async code => {
    const graph = await graphOf(lib(code));
    expect(graph.modules.has(cli)).toBe(true);
  });
});
