import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import { formatText } from '@/report/text.ts';

/**
 * An output chunk whose four `fs.watch` calls map to a file of the project, a file that does not
 * exist (code a bundler added), a file in a folder a framework generates, and nothing at all.
 */
function project(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'edgefit-owner-'));
  mkdirSync(path.join(root, 'src'));
  mkdirSync(path.join(root, 'out'));
  mkdirSync(path.join(root, '.svelte-kit/output'), { recursive: true });
  writeFileSync(path.join(root, 'src/app.ts'), '');
  writeFileSync(path.join(root, '.svelte-kit/output/server.js'), '');
  writeFileSync(
    path.join(root, 'out/index.js'),
    "import fs from 'node:fs';\nfs.watch('own');\nfs.watch('gone');\nfs.watch('stage');\nfs.watch('chunk');\n",
  );
  writeFileSync(
    path.join(root, 'out/index.js.map'),
    JSON.stringify({
      version: 3,
      sources: ['../src/app.ts', '../gone/x.ts', '../.svelte-kit/output/server.js'],
      names: [],
      mappings: ';AAAA;ACAA;ACAA;',
    }),
  );
  return root;
}

describe('who owns code in build output', () => {
  it('owns the file of the project, and leaves code with no file there to the build output', async () => {
    const root = project();
    const result = await check({ root, built: 'out/index.js', config: { targets: ['workerd'] } });
    const owners = Object.fromEntries(
      (result.reports[0]?.findings ?? []).map(finding => [
        finding.location.file,
        finding.buildOutput === true ? 'build output' : (finding.package?.name ?? 'your code'),
      ]),
    );
    expect(owners).toEqual({
      'src/app.ts': 'your code',
      'gone/x.ts': 'build output',
      '.svelte-kit/output/server.js': 'build output',
      'out/index.js': 'build output',
    });
  });

  it('shows build output as the owner in the text report', async () => {
    const root = project();
    const result = await check({ root, built: 'out/index.js', config: { targets: ['workerd'] } });
    const text = formatText(result, { color: false });
    expect(text).toMatch(/build output {2}gone\/x\.ts:/u);
    expect(text).toMatch(/your code {2}src\/app\.ts:/u);
  });
});
