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

  it('when a file requires the file', async () => {
    const usages = await scanned({
      'src/internal.mjs': exporter,
      'src/index.mjs': "const { crypto } = require('./internal.mjs');\ncrypto.createHash('md5');\n",
    });
    expect(usages['src/internal.mjs']).toContain('dynamic node:crypto');
  });

  it('when a file imports the file with import()', async () => {
    const usages = await scanned({
      'src/internal.mjs': exporter,
      'src/index.mjs':
        "const { crypto } = await import('./internal.mjs');\ncrypto.createHash('md5');\n",
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
