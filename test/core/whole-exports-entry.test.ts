import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import { scanModules } from '@/core/scan.ts';
import { readStoredModules } from '@/core/stored-modules.ts';
import { resolveGraph } from '@/resolve/graph.ts';
import type { EdgefitConfig } from '@/types.ts';
import { fixture } from '~/helpers.ts';

describe('a whole-module export and a stored-modules entry', () => {
  async function usagesOfFs(app: string): Promise<string[]> {
    const root = fixture(app);
    const graph = await resolveGraph({
      root,
      entries: ['src/index.js'],
      conditions: [],
      platform: 'node',
      nodeEnv: undefined,
    });
    const modules = readStoredModules(
      scanModules(graph, root, new Set(), { trace: true, nodeEnv: undefined }),
    );
    const found = modules.find(module => module.file.endsWith('util/fs.js'));
    return (found?.usages ?? []).map(usage => `${usage.kind} ${usage.display}`);
  }

  it('leaves no null character in the report of a project', async () => {
    const config: EdgefitConfig = { targets: ['deno'], entry: 'src/index.js' };
    for (const app of ['whole-export-app', 'stored-member-app']) {
      // eslint-disable-next-line no-await-in-loop -- two small projects
      const result = await check({ root: fixture(app), config, includeSupported: true });
      expect(JSON.stringify(result)).not.toContain('\\u0000');
    }
  });

  it('is followed first, so the entry has no usage left to replace', async () => {
    expect(await usagesOfFs('whole-export-app')).toEqual(['api node:fs']);
  });

  it('is replaced by the entry when the importer stores the module in a property', async () => {
    expect(await usagesOfFs('stored-member-app')).toEqual([
      'api node:fs',
      'api node:fs.readFileSync',
    ]);
  });
});
