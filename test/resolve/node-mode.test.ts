import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vite-plus/test';

import { resolveGraph } from '@/resolve/graph.ts';
import { isNodeMode } from '@/resolve/node-mode.ts';

/** A temp folder with the files, as paths to contents. */
function project(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'node-mode-'));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

const nodeMode = (root: string, file: string): boolean =>
  isNodeMode(path.join(root, file), new Map());

describe('node mode', () => {
  it('follows the extension before the package.json', () => {
    const root = project({ 'package.json': '{ "type": "module" }' });
    expect(nodeMode(root, 'a.mjs')).toBe(true);
    expect(nodeMode(root, 'a.mts')).toBe(true);
    expect(nodeMode(root, 'a.cjs')).toBe(false);
    expect(nodeMode(root, 'a.cts')).toBe(false);
    const plain = project({ 'package.json': '{}' });
    expect(nodeMode(plain, 'a.mjs')).toBe(true);
    expect(nodeMode(plain, 'a.cjs')).toBe(false);
  });

  it('follows the nearest package.json for other files', () => {
    const root = project({
      'package.json': '{ "type": "module" }',
      'plain/package.json': '{ "name": "plain" }',
      'commonjs/package.json': '{ "type": "commonjs" }',
      'nested/esm/package.json': '{ "type": "module" }',
    });
    expect(nodeMode(root, 'a.js')).toBe(true);
    expect(nodeMode(root, 'src/deep/a.ts')).toBe(true);
    expect(nodeMode(root, 'plain/a.js')).toBe(false);
    expect(nodeMode(root, 'commonjs/a.tsx')).toBe(false);
    expect(nodeMode(root, 'nested/esm/a.jsx')).toBe(true);
  });

  it('is off when no package.json is found up to the file system root', () => {
    // A missing folder just under the root reads only the root, which holds no package.json.
    const missing = path.join(path.parse(tmpdir()).root, `edgefit-missing-${process.pid}`);
    expect(nodeMode(missing, 'a.js')).toBe(false);
  });

  it('is on when the package.json cannot be read, so all of an import counts', () => {
    expect(nodeMode(project({ 'package.json': '{ not json' }), 'a.js')).toBe(true);
    expect(nodeMode(project({ 'package.json/x': '' }), 'a.js')).toBe(true);
  });

  it('reads each folder once', () => {
    const root = project({ 'package.json': '{ "type": "module" }' });
    const cache = new Map<string, boolean>();
    expect(isNodeMode(path.join(root, 'src/a.js'), cache)).toBe(true);
    rmSync(path.join(root, 'package.json'));
    expect(isNodeMode(path.join(root, 'src/b.js'), cache)).toBe(true);
    expect(cache.get(path.join(root, 'src'))).toBe(true);
  });
});

describe('the module graph', () => {
  it('sets node mode on each module', async () => {
    const root = project({
      'package.json': '{ "type": "module" }',
      'index.js': "import lib from './lib.cjs';\nconsole.log(lib);\n",
      'lib.cjs': 'exports.a = 1;\n',
    });
    const graph = await resolveGraph({
      root,
      entries: ['index.js'],
      conditions: [],
      platform: 'node',
      nodeEnv: undefined,
    });
    expect(graph.modules.get('index.js')?.nodeMode).toBe(true);
    expect(graph.modules.get('lib.cjs')?.nodeMode).toBe(false);
  });
});
