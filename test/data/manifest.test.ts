import { describe, expect, it } from 'vite-plus/test';

import { findDataDirectory } from '@/data/data-directory.ts';
import { describeSource, findSource, readSources } from '@/data/manifest.ts';
import type { DataSource } from '@/data/manifest.ts';

const source: DataSource = {
  provider: 'matrix',
  url: 'https://example.com',
  commit: 'ee581200e130e66d654a1a372d73eca3360310fb',
  license: 'MIT',
  versions: { workerd: '1.2.3', bun: '1.3.13' },
};

describe('describing sources', () => {
  it('shows the short commit and every runtime version', () => {
    expect(describeSource(source)).toBe('matrix@ee58120 (workerd 1.2.3; bun 1.3.13)');
  });

  it('limits the versions to the runtimes asked for', () => {
    expect(describeSource(source, ['bun'])).toBe('matrix@ee58120 (bun 1.3.13)');
  });

  it('shows just the provider without a commit', () => {
    expect(describeSource({ ...source, commit: undefined }, ['bun'])).toBe('matrix (bun 1.3.13)');
  });
});

describe('the shipped manifest', () => {
  const directory = findDataDirectory();

  it('lists sources by provider', () => {
    expect(readSources(directory).length).toBeGreaterThan(0);
    expect(findSource(directory, 'workers-nodejs-compat-matrix').license).toBe('MIT');
  });

  it('rejects a provider that has no source', () => {
    expect(() => findSource(directory, 'missing')).toThrow('no source for missing');
  });
});
