import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { resolveGraph, type ResolveOptions } from '@/resolve/graph.ts';

const verbatim = '{ "compilerOptions": { "verbatimModuleSyntax": true } }';
const source = [
  "import type { Config } from 'platform-only';",
  "import { Context } from 'platform-only';",
  'export const config: Config = {};',
  'export default (context: Context) => context;',
].join('\n');

function project(files: Record<string, string>): string {
  const outer = mkdtempSync(path.join(tmpdir(), 'edgefit-root-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(outer, name)), { recursive: true });
    writeFileSync(path.join(outer, name), text);
  }
  return path.join(outer, 'app');
}

const optionsFor = (root: string): ResolveOptions => ({
  root,
  entries: ['index.ts'],
  conditions: [],
  platform: 'node',
  nodeEnv: undefined,
});

describe('the tsconfig search in the bundle', () => {
  it('ignores a tsconfig above the root', async () => {
    const root = project({ 'tsconfig.json': verbatim, 'app/index.ts': source });
    await expect(resolveGraph(optionsFor(root))).resolves.toBeDefined();
  });

  it('keeps an import that a tsconfig of the project asks for', async () => {
    const root = project({ 'app/tsconfig.json': verbatim, 'app/index.ts': source });
    await expect(resolveGraph(optionsFor(root))).rejects.toThrow(
      'Could not resolve "platform-only"',
    );
  });
});
