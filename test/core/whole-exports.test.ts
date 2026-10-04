import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { extractScripts } from '@/core/scripts.ts';
import { resolveGraph } from '@/resolve/graph.ts';

async function scanned(files: Record<string, string>): Promise<Record<string, string[]>> {
  const root = mkdtempSync(path.join(tmpdir(), 'edgefit-whole-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  const graph = await resolveGraph({
    root,
    entries: ['src/index.js'],
    conditions: [],
    platform: 'node',
    nodeEnv: undefined,
  });
  const scripts = extractScripts(graph, root, new Set(), { trace: true, nodeEnv: undefined });
  return Object.fromEntries(
    scripts.map(({ file, found }) => [
      file,
      found.usages.map(
        usage => `${usage.kind} ${usage.display}${usage.guarded === true ? ' guarded' : ''}`,
      ),
    ]),
  );
}

const exporter = `var fs = null;
try {
  fs = require('fs');
  if (!fs || !fs.readFile) fs = null;
} catch (e) {}
module.exports = fs;
`;

const reader = (code: string): string => `var fs = require('./fs.js');\n${code}\n`;

describe('a file that sets module.exports to a Node.js module', () => {
  it('is that module in a file that binds it, with the guards of the importer', async () => {
    const usages = await scanned({
      'src/fs.js': exporter,
      'src/index.js': reader(
        'module.exports = function (f, cb) {\n  if (fs && fs.readFile) return fs.readFile(f, cb);\n};',
      ),
    });
    expect(usages['src/index.js']).toContain('api node:fs.readFile guarded');
    expect(usages['src/fs.js']).not.toContain('dynamic node:fs');
  });

  it('is that module for each name that a file destructures', async () => {
    const usages = await scanned({
      'src/fs.js': exporter,
      'src/index.js': "const { readFile } = require('./fs.js');\nreadFile('a', () => {});\n",
    });
    expect(usages['src/index.js']).toContain('api node:fs.readFile');
    expect(usages['src/fs.js']).not.toContain('dynamic node:fs');
  });

  it('stays unknown when a file passes the result on without a name', async () => {
    const usages = await scanned({
      'src/fs.js': exporter,
      'src/index.js': "module.exports = require('./fs.js');\n",
    });
    expect(usages['src/fs.js']).toContain('dynamic node:fs');
  });

  it('stays unknown when one importer loads it in a way that is not followed', async () => {
    const usages = await scanned({
      'src/fs.js': exporter,
      'src/other.js': "import('./fs.js');\n",
      'src/index.js': `${reader('fs.readFile;')}require('./other.js');\n`,
    });
    expect(usages['src/fs.js']).toContain('dynamic node:fs');
  });
});

describe('a whole-module export that cannot be followed', () => {
  it('is followed when the same file binds it in two functions', async () => {
    const usages = await scanned({
      'src/fs.js': exporter,
      'src/index.js':
        "exports.a = function () {\n  const fs = require('./fs.js');\n  return fs.readFile;\n};\nexports.b = function () {\n  const fs = require('./fs.js');\n  return fs.readFile;\n};\n",
    });
    expect(usages['src/fs.js']).not.toContain('dynamic node:fs');
    expect(usages['src/index.js']).toContain('api node:fs.readFile');
  });

  it('stays unknown when the same file also passes the module on', async () => {
    const usages = await scanned({
      'src/fs.js': exporter,
      'src/index.js': "var fs = require('./fs.js');\nfs.readFile;\nregister(require('./fs.js'));\n",
    });
    expect(usages['src/fs.js']).toContain('dynamic node:fs');
  });

  it('stays unknown when a helper wraps the require', async () => {
    const usages = await scanned({
      'src/fs.js': exporter,
      'src/index.js': "var fs = wrap(require('./fs.js'));\nfs.readFile;\n",
    });
    expect(usages['src/fs.js']).toContain('dynamic node:fs');
  });

  it('stays unknown when an importer is an ES module', async () => {
    const usages = await scanned({
      'src/fs.js': exporter,
      'src/index.js': "import fs from './fs.js';\nfs.readFile;\n",
    });
    expect(usages['src/fs.js']).toContain('dynamic node:fs');
  });
});

describe('a name that is not read as the whole export', () => {
  it('is not a module when the name may hold something else', async () => {
    const usages = await scanned({
      'src/fs.js': "var fs = null;\nfs = require('fs');\nfs = other;\nmodule.exports = fs;\n",
      'src/index.js': reader('fs.readFile;'),
    });
    expect(usages['src/index.js']).not.toContain('api node:fs.readFile');
  });

  it('is told apart from an export named like the whole export', async () => {
    const usages = await scanned({
      'src/fs.js': "const fs = require('fs');\nexports['*'] = fs;\nexports.default = fs;\n",
      'src/index.js': "const m = require('./fs.js');\nm.readFile;\n",
    });
    expect(usages['src/index.js']).not.toContain('api node:fs.readFile');
  });
});
