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

  it('stays unknown when the file is imported as a whole that is passed on, or re-exported', async () => {
    const whole = await scanned({
      'src/internal.mjs': exporter,
      'src/index.mjs': "import * as all from './internal.mjs';\nuse(all);\n",
    });
    expect(whole['src/internal.mjs']).toContain('dynamic node:crypto');
    const reexported = await scanned({
      'src/internal.mjs': exporter,
      'src/index.mjs': "export { crypto } from './internal.mjs';\n",
    });
    expect(reexported['src/internal.mjs']).toContain('dynamic node:crypto');
  });

  it.each([
    ['the whole result passed on', "const all = await import('./internal.mjs');\nuse(all);"],
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

  it('stays unknown when a file requires an ES module as a whole and passes it on', async () => {
    const usages = await scanned({
      'src/internal.mjs': exporter,
      'src/index.mjs': "const all = require('./internal.mjs');\nuse(all);\n",
    });
    expect(usages['src/internal.mjs']).toContain('dynamic node:crypto');
  });

  it.each([
    ['the whole result passed on', "const all = require('./internal.js');\nuse(all);"],
    [
      'a computed member of the result',
      "const all = require('./internal.js');\nall[name].createHash('md5');",
    ],
    ['a write to a member', "const all = require('./internal.js');\nall.crypto = null;"],
    ['a rest element', "const { crypto, ...rest } = require('./internal.js');\nuse(rest);"],
    ['a member of the call', "require('./internal.js').crypto.createHash('md5');"],
  ])('stays unknown when a file requires it and keeps %s', async (_name, code) => {
    const usages = await scanned({ 'src/internal.js': exporterCjs, 'src/index.mjs': code });
    expect(usages['src/internal.js']).toContain('dynamic node:crypto');
  });
});

describe('a file that another file reads by member', () => {
  const both =
    "const crypto = require('node:crypto');\nconst util = require('node:util');\nexports.crypto = crypto;\nexports.util = util;\n";

  it.each([
    ['require', "const files = require('./internal.js');\nfiles.crypto.createHash('md5');\n"],
    [
      'await import',
      "export async function load() {\n  const files = await import('./internal.js');\n  return files.crypto.createHash('md5');\n}\n",
    ],
  ])(
    'is read member by member after %s, and is not unknown in the exporter',
    async (_name, code) => {
      const usages = await scanned({ 'src/internal.js': both, 'src/index.mjs': code });
      expect(usages['src/index.mjs']).toContain('api node:crypto.createHash');
      expect(usages['src/internal.js']).not.toContain('dynamic node:crypto');
    },
  );

  it('keeps the unknown of a name that no file reads', async () => {
    const usages = await scanned({
      'src/internal.js': both,
      'src/index.mjs': "const files = require('./internal.js');\nfiles.crypto.createHash('md5');\n",
    });
    expect(usages['src/internal.js']).not.toContain('api node:util.inspect');
  });

  it('follows a name that is a project export and records nothing for it', async () => {
    const usages = await scanned({
      'src/internal.js': `${both}exports.local = 1;\n`,
      'src/index.mjs':
        "const files = require('./internal.js');\nfiles.local;\nfiles.crypto.createHash('md5');\n",
    });
    expect(usages['src/index.mjs']).toEqual(['api node:crypto.createHash']);
  });
});

describe('a file that another file reads partly by member', () => {
  const both =
    "const crypto = require('node:crypto');\nconst util = require('node:util');\nexports.crypto = crypto;\nexports.util = util;\n";

  it('asks for the whole file when one load of it is passed on, so nothing in the file is followed', async () => {
    const usages = await scanned({
      'src/internal.js': both,
      'src/index.mjs':
        "const { crypto } = require('./internal.js');\nconst all = require('./internal.js');\nuse(all);\ncrypto.createHash('md5');\n",
    });
    expect(usages['src/index.mjs']).not.toContain('api node:crypto.createHash');
    expect(usages['src/internal.js']).toContain('dynamic node:crypto');
  });

  it('follows the members of an importer that the graph cannot trace', async () => {
    const usages = await scanned({
      'src/internal.js': both,
      'src/index.mjs':
        "const files = require('./internal.js');\nfiles.crypto.createHash('md5');\nmodule.exports = {};\n",
    });
    expect(usages['src/internal.js']).not.toContain('dynamic node:crypto');
  });
});

describe('a file that another file imports as a namespace and reads by member', () => {
  it.each([
    ['a member', "import * as all from './internal.mjs';\nall.crypto.createHash('md5');\n"],
    [
      'a member read twice',
      "import * as all from './internal.mjs';\nall.crypto.createHash('md5');\nall.crypto.randomBytes(1);\n",
    ],
  ])('is read member by member for %s, and is not unknown in the exporter', async (_name, code) => {
    const usages = await scanned({ 'src/internal.mjs': exporter, 'src/index.mjs': code });
    expect(usages['src/index.mjs']).toContain('api node:crypto.createHash');
    expect(usages['src/internal.mjs']).not.toContain('dynamic node:crypto');
  });

  it.each([
    ['stored', "import * as all from './internal.mjs';\nconst saved = all;\nuse(saved);\n"],
    [
      'read with a computed key',
      "import * as all from './internal.mjs';\nall[name].createHash('md5');\n",
    ],
    ['exported again', "import * as all from './internal.mjs';\nexport { all };\n"],
  ])('stays unknown when the namespace is %s', async (_name, code) => {
    const usages = await scanned({ 'src/internal.mjs': exporter, 'src/index.mjs': code });
    expect(usages['src/internal.mjs']).toContain('dynamic node:crypto');
  });
});
