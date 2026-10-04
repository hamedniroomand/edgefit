import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import { resolveGraph } from '@/resolve/graph.ts';
import { fixture } from '~/helpers.ts';

const options = {
  root: fixture('browser-false-app'),
  entries: ['src/index.mjs'],
  conditions: ['browser'],
  platform: 'browser' as const,
  nodeEnv: undefined,
};

describe('a module that the browser field maps to false', () => {
  it('is left out of the graph, and no module links to it', async () => {
    const graph = await resolveGraph(options);
    const paths = [...graph.modules.keys()];
    expect(paths.some(file => file.startsWith('(disabled):'))).toBe(false);
    const mapper = graph.modules.get('node_modules/mapper/index.js');
    expect(mapper?.links).toEqual([]);
    expect(mapper?.imports).toEqual([]);
  });

  it('does not stop a check on a target that uses the browser condition', async () => {
    const result = await check({
      root: fixture('browser-false-app'),
      config: { targets: ['workerd'], entry: 'src/index.mjs', workerd: { wranglerConfig: false } },
    });
    expect(result.reports[0]?.findings).toEqual([]);
  });
});
