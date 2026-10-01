import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { ImportChains } from '@/core/chains.ts';
import type { ModuleGraph } from '@/resolve/graph.ts';
import { PackageResolver } from '@/resolve/packages.ts';
import { fixture } from '~/helpers.ts';

function graphOf(entry: string, edges: Record<string, string[]>): ModuleGraph {
  const modules = new Map(
    Object.entries(edges).map(([file, imports]) => [file, { imports, links: [], externals: [] }]),
  );
  return { entry, modules };
}

describe('import chains', () => {
  const resolver = new PackageResolver(fixture('worker'));

  it('takes the shortest chain from the entry', () => {
    const chains = new ImportChains(
      graphOf('a.ts', {
        'a.ts': ['b.ts', 'd.ts'],
        'b.ts': ['c.ts'],
        'c.ts': ['x.ts'],
        'd.ts': ['x.ts'],
        'x.ts': [],
      }),
      resolver,
    );
    expect(chains.chainTo('x.ts')).toEqual(['a.ts', 'd.ts', 'x.ts']);
  });

  it('is only the entry for the entry itself', () => {
    const chains = new ImportChains(graphOf('a.ts', { 'a.ts': [] }), resolver);
    expect(chains.chainTo('a.ts')).toEqual(['a.ts']);
  });

  it('collapses a package’s internal files into its name', () => {
    const inside = path.join('node_modules', 'pg-lite', 'lib', 'index.js');
    const manifest = path.join('node_modules', 'pg-lite', 'package.json');
    const chains = new ImportChains(
      graphOf('src/index.ts', { 'src/index.ts': [manifest], [manifest]: [inside], [inside]: [] }),
      resolver,
    );
    expect(chains.chainTo(inside)).toEqual(['src/index.ts', 'pg-lite']);
  });
});
