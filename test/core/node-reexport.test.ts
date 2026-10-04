import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { extractScripts } from '@/core/scripts.ts';
import { resolveGraph } from '@/resolve/graph.ts';

async function scanned(files: Record<string, string>): Promise<Record<string, string[]>> {
  const root = mkdtempSync(path.join(tmpdir(), 'edgefit-reexport-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  const graph = await resolveGraph({
    root,
    entries: ['src/index.mjs'],
    conditions: [],
    platform: 'node',
    nodeEnv: undefined,
  });
  const scripts = extractScripts(graph, root, new Set(), { trace: true, nodeEnv: undefined });
  return Object.fromEntries(
    scripts.map(({ file, found }) => [
      file,
      found.usages.map(usage => `${usage.kind} ${usage.display}`),
    ]),
  );
}

describe('a direct re-export of a Node.js module', () => {
  it('follows a member under the exported name', async () => {
    const usages = await scanned({
      'src/internal.mjs': "export { promises as fsp } from 'node:fs';\n",
      'src/index.mjs': "import { fsp } from './internal.mjs';\nfsp.stat('.');\n",
    });
    expect(usages['src/index.mjs']).toContain('api node:fs.promises.stat');
    expect(usages['src/internal.mjs']).toEqual(['api node:fs.promises']);
  });

  it('follows the whole module from export * as', async () => {
    const usages = await scanned({
      'src/internal.mjs': "export * as fs from 'node:fs';\n",
      'src/index.mjs': "import { fs } from './internal.mjs';\nfs.readFile('.');\n",
    });
    expect(usages['src/index.mjs']).toContain('api node:fs.readFile');
    expect(usages['src/internal.mjs']).toEqual(['api node:fs']);
  });

  it('stays unknown when nothing imports the name', async () => {
    const usages = await scanned({
      'src/internal.mjs': "export { promises as fsp } from 'node:fs';\n",
      'src/index.mjs': "import './internal.mjs';\n",
    });
    expect(usages['src/internal.mjs']).toContain('dynamic node:fs.promises');
  });

  it('stays unknown when another file re-exports the name', async () => {
    const usages = await scanned({
      'src/internal.mjs': "export { promises as fsp } from 'node:fs';\n",
      'src/index.mjs': "export { fsp } from './internal.mjs';\n",
    });
    expect(usages['src/internal.mjs']).toContain('dynamic node:fs.promises');
  });
});
