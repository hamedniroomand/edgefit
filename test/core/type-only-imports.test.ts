import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';

const unusedImport = "import { ServerResponse } from 'node:http';\nlet response: ServerResponse;\n";

function project(tsconfig: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'edgefit-type-only-'));
  const files: Record<string, string> = {
    'package.json': '{ "type": "module" }',
    'tsconfig.json': tsconfig,
    'wrangler.jsonc':
      '{ "main": "src/index.ts", "compatibility_date": "2025-04-01", "compatibility_flags": ["nodejs_compat"] }',
    'src/index.ts': `import { run } from 'pkg';\n${unusedImport}export default { fetch: run };\n`,
    'node_modules/pkg/package.json': '{ "name": "pkg", "version": "1.0.0", "main": "index.ts" }',
    'node_modules/pkg/index.ts': `${unusedImport}export const run = () => 1;\n`,
  };
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

async function modulesWithFindings(tsconfig: string): Promise<string[]> {
  const [report] = (await check({ root: project(tsconfig), config: {} })).reports;
  return (report?.findings ?? []).map(finding => finding.location.file);
}

describe('imports that are used only as types in a scan', () => {
  it('gives no finding with the default tsconfig', async () => {
    expect(await modulesWithFindings('{}')).toEqual([]);
  });

  it('keeps the finding in project files only when verbatimModuleSyntax is on', async () => {
    expect(
      await modulesWithFindings('{ "compilerOptions": { "verbatimModuleSyntax": true } }'),
    ).toEqual(['src/index.ts']);
  });
});
