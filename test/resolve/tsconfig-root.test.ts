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

  it('does not change the bundle when the root has its own tsconfig', async () => {
    const root = project({
      'app/tsconfig.json': '{ "compilerOptions": { "preserveValueImports": true } }',
      'app/types.ts': 'export type T = number;\n',
      'app/index.ts':
        "import { type T } from './types';\nexport const t = (value: T): T => value;\n",
    });
    expect(await modulesOf(root, 'index.ts')).toEqual(['index.ts']);
  });
});

const loadfail = {
  'app/node_modules/loadfail/package.json': '{ "name": "loadfail", "type": "module" }',
  'app/node_modules/loadfail/index.js': 'export const ok = 1;\n',
};

async function modulesOf(root: string, entry: string): Promise<string[]> {
  const graph = await resolveGraph({ ...optionsFor(root), entries: [entry] });
  return [...graph.modules.keys()].toSorted();
}

describe('a tsconfig below the root when one is above the root', () => {
  it('keeps an import that it asks for', async () => {
    const root = project({
      'tsconfig.json': '{ "compilerOptions": {} }',
      ...loadfail,
      'app/src/tsconfig.json': verbatim,
      'app/src/index.ts': "import { ok } from 'loadfail';\nexport const go = (): string => 'hi';\n",
    });
    expect(await modulesOf(root, 'src/index.ts')).toContain('node_modules/loadfail/index.js');
  });

  it('does not let a tsconfig above the root apply to a file outside the root', async () => {
    const root = project({
      'tsconfig.json': verbatim,
      'shared/index.ts': source,
      'app/index.ts': "export { config } from '../shared/index.ts';\n",
    });
    await expect(resolveGraph(optionsFor(root))).resolves.toBeDefined();
  });
});

const entries: Record<string, string> = {
  'src/unused.ts': "import { ok } from 'loadfail';\nexport const a = 1;\n",
  'src/reexport.ts': "export { T } from './types';\nexport const b = 1;\n",
  'src/import-export.ts': "import { T } from './types';\nexport { T };\nexport const c = 1;\n",
  'src/mixed.ts':
    "import { type I } from './types';\nimport type { T } from './types';\nexport const d = (t: T, i: I): unknown => [t, i];\n",
  'src/view.tsx': "import { ok } from 'loadfail';\nexport const e = (): unknown => <div />;\n",
  'src/package.ts': "import { p } from 'pkg';\nexport const f = p;\n",
  'src/broken.ts': "import { ok } from 'loadfail';\nexport const = 1;\n",
};

const nested = {
  ...loadfail,
  ...Object.fromEntries(Object.entries(entries).map(([name, text]) => [`app/${name}`, text])),
  'app/src/types.ts': 'export type T = number;\nexport interface I { a: 1 }\nexport const v = 1;\n',
  'app/src/node_modules/pkg/package.json': '{ "name": "pkg", "main": "index.ts" }',
  'app/src/node_modules/pkg/index.ts': "import { ok } from 'loadfail';\nexport const p = 1;\n",
};

async function outcome(root: string, entry: string): Promise<string[] | string> {
  try {
    return await modulesOf(root, entry);
  } catch (error) {
    return String(error);
  }
}

async function outcomes(root: string): Promise<unknown[]> {
  const found = await Promise.all(
    Object.keys(entries).map(async entry => [entry, await outcome(root, entry)]),
  );
  return found;
}

describe('the bundle of a tsconfig below the root', () => {
  it.each([verbatim, '{ "compilerOptions": { "importsNotUsedAsValues": "preserve" } }'])(
    'is the same when a tsconfig is above the root: %s',
    async config => {
      const alone = project({ ...nested, 'app/src/tsconfig.json': config });
      const below = project({ ...nested, 'app/src/tsconfig.json': config, 'tsconfig.json': '{}' });
      expect(await outcomes(below)).toEqual(await outcomes(alone));
    },
  );
});
