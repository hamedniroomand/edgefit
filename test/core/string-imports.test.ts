import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { extractScripts } from '@/core/scripts.ts';
import { sharedMethods } from '@/core/string-imports.ts';
import { resolveGraph } from '@/resolve/graph.ts';

async function usagesOfIndex(files: Record<string, string>): Promise<string[]> {
  const root = mkdtempSync(path.join(tmpdir(), 'edgefit-strings-'));
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
  const scripts = extractScripts(graph, root, new Set(['globalThis']), {
    trace: true,
    nodeEnv: undefined,
  });
  const found = scripts.find(({ file }) => file === 'src/index.mjs')?.found;
  return (found?.usages ?? []).map(usage => `${usage.kind} ${usage.display}`);
}

const read = "import { key } from './key.mjs';\nexport const get = () => globalThis[key]();\n";
const unknown = ['dynamic globalThis[<expression>]'];
// The same as a `const` of the file: the string stands for the key.
const known = ['api ~pkg/current'];

describe('a computed key that is a string imported from another file', () => {
  it.each([
    ['a const', "export const key = '~pkg/current';\n"],
    ['a join of strings', "const base = '~pkg/';\nexport const key = `${base}current`;\n"],
    ['an export list', "const key = '~pkg/current';\nexport { key };\n"],
    ['a renamed export', "const k = '~pkg/current';\nexport { k as key };\n"],
  ])('is the string of %s', async (_name, code) => {
    expect(await usagesOfIndex({ 'src/index.mjs': read, 'src/key.mjs': code })).toEqual(known);
  });

  it('is the string of a file in a package', async () => {
    const found = await usagesOfIndex({
      'src/index.mjs': "import { key } from 'dep';\nexport const get = () => globalThis[key];\n",
      'node_modules/dep/package.json': '{"name":"dep","main":"index.mjs"}',
      'node_modules/dep/index.mjs': "export const key = '~pkg/current';\n",
    });
    expect(found).toEqual(known);
  });

  it.each([
    ['a re-export', "export { key } from './inner.mjs';\n"],
    ['a renamed re-export', "export { inner as key } from './inner.mjs';\n"],
    [
      'an import that is exported',
      "import { key as inner } from './inner.mjs';\nexport { inner as key };\n",
    ],
  ])('follows %s of a string', async (_name, code) => {
    const found = await usagesOfIndex({
      'src/index.mjs': read,
      'src/key.mjs': code,
      'src/inner.mjs': "export const key = '~pkg/current';\nexport const inner = key;\n",
    });
    expect(found).toEqual(known);
  });

  it.each([
    ['a let', "export let key = '~pkg/current';\n"],
    ['a value that is not known', 'export const key = other();\n'],
  ])('stays unknown for %s', async (_name, code) => {
    expect(await usagesOfIndex({ 'src/index.mjs': read, 'src/key.mjs': code })).toEqual(unknown);
  });
});

type Script = Parameters<typeof sharedMethods>[0][number];

const script = (file: string, source: string, listMethods: string[] = []): Script => ({
  file,
  source,
  found: {
    usages: [],
    offsets: [],
    shape: undefined,
    optionsSet: [],
    aliases: new Map(),
    strings: new Map(),
    checks: new Map(),
    listMethods,
  },
});

/** The methods of `a.mjs` that the other files mention. */
const sharedWith = (name: string, others: string[]): ReadonlySet<string> | undefined =>
  sharedMethods([
    script('a.mjs', `class A { ${name}() {} }`, [name]),
    ...others.map((source, index) => script(`b${index}.mjs`, source)),
  ]).get('a.mjs');

describe('a method that another file of the graph mentions', () => {
  it.each([
    ['a call', 'server.register(list);'],
    ['a computed read', "server['register'](list);"],
    ['a read that is not a call', 'const run = server.register;'],
  ])('is found for %s', (_name, source) => {
    expect(sharedWith('register', [source])).toEqual(new Set(['register']));
  });

  it('is found when the name has a dollar sign', () => {
    expect(sharedWith('$register', ['server.$register(list);'])).toEqual(new Set(['$register']));
  });

  it.each([
    ['a longer name', 'server.registered();'],
    ['a name with a part before', 'server.reregister();'],
    ['a name with a dollar sign before', 'server.$register();'],
    ['another name', 'server.start();'],
  ])('is not found for %s', (_name, source) => {
    expect(sharedWith('register', [source])).toBeUndefined();
  });

  it('is not found when only its own file mentions it', () => {
    expect(sharedWith('register', [])).toBeUndefined();
  });
});
