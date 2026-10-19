import { describe, expect, it } from 'vite-plus/test';

import { graphPlugins } from '@/resolve/plugins.ts';
import { runtimeExternals } from '@/resolve/runtime-externals.ts';

describe('the plugins of a graph build', () => {
  it('run the target plugins first', () => {
    const target = { ...runtimeExternals, name: 'target' };
    const names = graphPlugins({ root: '/', entries: [], plugins: [target] }, new Set()).map(
      plugin => plugin.name,
    );
    expect(names[0]).toBe('target');
    expect(names).toHaveLength(5);
  });
});
