import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { extractScripts } from '@/core/scripts.ts';
import { resolveGraph } from '@/resolve/graph.ts';

async function scanned(files: Record<string, string>): Promise<Record<string, string[]>> {
  const root = mkdtempSync(path.join(tmpdir(), 'edgefit-alias-'));
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

const exporter = "import * as crypto from 'node:crypto';\nexport { crypto };\n";
const importer =
  "import { crypto } from './internal.mjs';\nexport const h = crypto.createHash('sha256');\n";

describe('a Node.js module that a file re-exports', () => {
  it('counts its members in the file that uses it, and is not unknown in the exporter', async () => {
    const usages = await scanned({ 'src/internal.mjs': exporter, 'src/index.mjs': importer });
    expect(usages['src/index.mjs']).toContain('api node:crypto.createHash');
    expect(usages['src/internal.mjs']).toEqual(['api node:crypto']);
  });

  it('follows a renamed export and a default export', async () => {
    const renamed = await scanned({
      'src/internal.mjs':
        "import * as crypto from 'node:crypto';\nexport { crypto as nodeCrypto };\n",
      'src/index.mjs':
        "import { nodeCrypto } from './internal.mjs';\nnodeCrypto.createHash('md5');\n",
    });
    expect(renamed['src/index.mjs']).toContain('api node:crypto.createHash');
    expect(renamed['src/internal.mjs']).toEqual(['api node:crypto']);
    const byDefault = await scanned({
      'src/internal.mjs': "import * as crypto from 'node:crypto';\nexport default crypto;\n",
      'src/index.mjs': "import crypto from './internal.mjs';\ncrypto.createHash('md5');\n",
    });
    expect(byDefault['src/index.mjs']).toContain('api node:crypto.createHash');
    expect(byDefault['src/internal.mjs']).toEqual(['api node:crypto']);
  });
});

describe('a Node.js module that a file re-exports, and that stays unknown', () => {
  it('when no file imports the name', async () => {
    const usages = await scanned({
      'src/internal.mjs': exporter,
      'src/index.mjs': "import './internal.mjs';\n",
    });
    expect(usages['src/internal.mjs']).toContain('dynamic node:crypto');
  });

  it('stays unknown when the file is imported as a whole or re-exported', async () => {
    const whole = await scanned({
      'src/internal.mjs': exporter,
      'src/index.mjs': "import * as all from './internal.mjs';\nall.crypto.createHash('md5');\n",
    });
    expect(whole['src/internal.mjs']).toContain('dynamic node:crypto');
    const reexported = await scanned({
      'src/internal.mjs': exporter,
      'src/index.mjs': "export { crypto } from './internal.mjs';\n",
    });
    expect(reexported['src/internal.mjs']).toContain('dynamic node:crypto');
  });

  it.each([
    [
      'the whole result',
      "const all = await import('./internal.mjs');\nall.crypto.createHash('md5');",
    ],
    ['a rest element', "const { crypto, ...rest } = await import('./internal.mjs');\nuse(rest);"],
    ['a nested pattern', "const { crypto: { createHash } } = await import('./internal.mjs');"],
    ['a member of the result', "(await import('./internal.mjs')).crypto.createHash('md5');"],
    ['a promise that is not awaited', "const loading = import('./internal.mjs');"],
  ])('when a file imports the file with import() and keeps %s', async (_name, code) => {
    const usages = await scanned({
      'src/internal.mjs': exporter,
      'src/index.mjs': `export async function load() {\n${code}\n}\n`,
    });
    expect(usages['src/internal.mjs']).toContain('dynamic node:crypto');
  });

  it('stays unknown in a file that the entry exports', async () => {
    const usages = await scanned({
      'src/index.mjs': "import * as crypto from 'node:crypto';\nexport { crypto };\n",
    });
    expect(usages['src/index.mjs']).toContain('dynamic node:crypto');
  });
});

describe('a Node.js module that a file loads with import() by name', () => {
  const lazy =
    "export async function load() {\n  const { crypto, util: u = 1 } = await import('./internal.mjs');\n  return crypto.createHash('md5');\n}\n";
  const both =
    "import * as crypto from 'node:crypto';\nimport * as util from 'node:util';\nexport { crypto, util };\n";

  it('is that module in the file, and is not unknown in the exporter', async () => {
    const usages = await scanned({ 'src/internal.mjs': both, 'src/index.mjs': lazy });
    expect(usages['src/index.mjs']).toContain('api node:crypto.createHash');
    expect(usages['src/internal.mjs']).toEqual(['api node:crypto', 'api node:util']);
  });

  it('is followed through parentheses around the await', async () => {
    const usages = await scanned({
      'src/internal.mjs': both,
      'src/index.mjs':
        "export async function load() {\n  const { crypto } = (await import('./internal.mjs'));\n  return crypto.createHash('md5');\n}\n",
    });
    expect(usages['src/index.mjs']).toContain('api node:crypto.createHash');
    expect(usages['src/internal.mjs']).not.toContain('dynamic node:crypto');
  });

  it('is followed in a file that is not the entry', async () => {
    const usages = await scanned({
      'src/internal.mjs': both,
      'src/lazy.mjs': lazy,
      'src/index.mjs': "export { load } from './lazy.mjs';\n",
    });
    expect(usages['src/lazy.mjs']).toContain('api node:crypto.createHash');
    expect(usages['src/internal.mjs']).toEqual(['api node:crypto', 'api node:util']);
  });

  it('asks the file only for the names that it destructures', async () => {
    const usages = await scanned({
      'src/internal.mjs': `${both}export function unused() { return process.binding('x'); }\n`,
      'src/index.mjs': lazy,
    });
    expect(usages['src/internal.mjs']).not.toContain('api node:process.binding');
  });
});

describe('a Node.js module that a CommonJS file exports and another file requires by name', () => {
  const exporterCjs = "const crypto = require('node:crypto');\nexports.crypto = crypto;\n";

  it('is that module in the file that destructures it', async () => {
    const usages = await scanned({
      'src/internal.js': exporterCjs,
      'src/index.mjs': "const { crypto } = require('./internal.js');\ncrypto.createHash('md5');\n",
    });
    expect(usages['src/index.mjs']).toContain('api node:crypto.createHash');
    expect(usages['src/internal.js']).not.toContain('dynamic node:crypto');
  });

  it('is followed through the form that tsc writes for import() and an interop helper', async () => {
    const usages = await scanned({
      'src/internal.js': exporterCjs,
      'src/index.mjs':
        "async function load() {\n  const { crypto } = await Promise.resolve().then(() => __importStar(require('./internal.js')));\n  return crypto.createHash('md5');\n}\nload();\n",
    });
    expect(usages['src/index.mjs']).toContain('api node:crypto.createHash');
    expect(usages['src/internal.js']).not.toContain('dynamic node:crypto');
  });

  it('stays unknown when a file requires an ES module as a whole', async () => {
    const usages = await scanned({
      'src/internal.mjs': exporter,
      'src/index.mjs': "const all = require('./internal.mjs');\nall.crypto.createHash('md5');\n",
    });
    expect(usages['src/internal.mjs']).toContain('dynamic node:crypto');
  });

  it.each([
    ['the whole result', "const all = require('./internal.js');\nall.crypto.createHash('md5');"],
    ['a rest element', "const { crypto, ...rest } = require('./internal.js');\nuse(rest);"],
    ['a member of the call', "require('./internal.js').crypto.createHash('md5');"],
  ])('stays unknown when a file requires it and keeps %s', async (_name, code) => {
    const usages = await scanned({ 'src/internal.js': exporterCjs, 'src/index.mjs': code });
    expect(usages['src/internal.js']).toContain('dynamic node:crypto');
  });
});
