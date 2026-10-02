import { describe, expect, it } from 'vite-plus/test';

import { resolveGraph, type ResolveOptions } from '@/resolve/graph.ts';
import { moduleName } from '@/resolve/optional-peers.ts';
import { fixture } from '~/helpers.ts';

const options = (entry: string): ResolveOptions => ({
  root: fixture('peer-app'),
  entries: [entry],
  conditions: [],
  platform: 'node',
  nodeEnv: undefined,
});

describe('optional peer dependencies', () => {
  it('keeps an optional peer that is not installed out of the graph', async () => {
    const graph = await resolveGraph(options('src/optional.ts'));
    expect(graph.modules.get('node_modules/with-peer/index.js')?.missingPeers).toEqual([
      'react/jsx-runtime',
    ]);
  });

  it('reads the peers from the package manifest, not a nested one', async () => {
    const graph = await resolveGraph(options('src/nested.ts'));
    expect(graph.modules.get('node_modules/nested-peer/esm/index.js')?.missingPeers).toEqual([
      'react',
    ]);
  });

  it('still fails for a peer that is not optional', async () => {
    await expect(resolveGraph(options('src/strict.ts'))).rejects.toThrow(
      'Could not resolve "react"',
    );
  });

  it('names the module of a subpath', () => {
    expect(moduleName('react/jsx-runtime')).toBe('react');
    expect(moduleName('@scope/pkg/sub')).toBe('@scope/pkg');
  });
});
