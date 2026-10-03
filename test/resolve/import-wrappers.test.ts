import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { resolveGraph } from '@/resolve/graph.ts';
import type { ResolveOptions } from '@/resolve/graph.ts';

const wrapper = 'function load(name) {\n  return import(name);\n}\n';

function projectOf(entry: string): ResolveOptions {
  const root = mkdtempSync(path.join(tmpdir(), 'edgefit-wrapper-'));
  mkdirSync(path.join(root, 'src'));
  mkdirSync(path.join(root, 'node_modules/dep'), { recursive: true });
  writeFileSync(
    path.join(root, 'node_modules/dep/package.json'),
    '{"name":"dep","main":"index.js"}',
  );
  writeFileSync(path.join(root, 'node_modules/dep/index.js'), 'module.exports = 1;\n');
  writeFileSync(path.join(root, 'src/index.js'), entry);
  return {
    root,
    entries: ['src/index.js'],
    conditions: [],
    platform: 'node',
    nodeEnv: undefined,
  };
}

describe('a function that only imports its argument, in the module graph', () => {
  it('adds the module of a call with a literal, linked from the file of the call', async () => {
    const graph = await resolveGraph(
      projectOf(`${wrapper}export const dep = await load('dep');\n`),
    );
    expect(graph.modules.has('node_modules/dep/index.js')).toBe(true);
    expect(graph.modules.get('src/index.js')?.imports).toContain('node_modules/dep/index.js');
  });

  it('adds a module that an arrow function loads', async () => {
    const graph = await resolveGraph(
      projectOf(`const load = (name) => import(name);\nexport const dep = await load('dep');\n`),
    );
    expect(graph.modules.has('node_modules/dep/index.js')).toBe(true);
  });

  it('adds nothing for a call with a variable', async () => {
    const graph = await resolveGraph(
      projectOf(`${wrapper}export const dep = await load(process.argv[2]);\n`),
    );
    expect(graph.modules.has('node_modules/dep/index.js')).toBe(false);
  });

  it('leaves a file without a wrapper as it is', async () => {
    const graph = await resolveGraph(projectOf("export const dep = await import('dep');\n"));
    expect(graph.modules.has('node_modules/dep/index.js')).toBe(true);
  });
});
