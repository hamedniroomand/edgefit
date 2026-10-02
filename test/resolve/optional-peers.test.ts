import type { Message } from 'esbuild';
import { describe, expect, it } from 'vite-plus/test';

import { resolveGraph, type ResolveOptions } from '@/resolve/graph.ts';
import { acceptMissingPeers, moduleName } from '@/resolve/optional-peers.ts';
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

  it('ignores failures that are not an optional peer of an installed package', () => {
    const at = (file: string): Message['location'] => ({ file }) as Message['location'];
    const messages = [
      { text: 'Other error', location: at('node_modules/with-peer/index.js') },
      { text: 'Could not resolve "react"', location: null },
      { text: 'Could not resolve "react"', location: at('/missing/node_modules/x/index.js') },
      { text: 'Could not resolve "vue"', location: at('node_modules/with-peer/index.js') },
    ] as Message[];
    const accepted = new Set<string>();
    expect(acceptMissingPeers(fixture('peer-app'), messages, accepted)).toBe(false);
    expect(accepted.size).toBe(0);
  });

  it('reports a failure it has already accepted as not new', () => {
    const messages = [
      { text: 'Could not resolve "react"', location: { file: 'node_modules/with-peer/index.js' } },
    ] as Message[];
    const accepted = new Set<string>();
    expect(acceptMissingPeers(fixture('peer-app'), messages, accepted)).toBe(true);
    expect(acceptMissingPeers(fixture('peer-app'), messages, accepted)).toBe(false);
  });
});
