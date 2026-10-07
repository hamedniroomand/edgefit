import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { formatPackage, PackageResolver } from '@/resolve/packages.ts';
import { fixture } from '~/helpers.ts';

describe('package resolver', () => {
  const resolver = new PackageResolver(fixture('worker'));

  it('finds the package that owns a file under node_modules', () => {
    expect(resolver.packageFor(path.join('node_modules', 'chokidar', 'index.js'))).toEqual({
      name: 'chokidar',
      version: '4.0.1',
    });
  });

  it('finds the owner of a nested file through the nearest manifest', () => {
    expect(resolver.packageFor(path.join('node_modules', 'pg-lite', 'lib', 'index.js'))?.name).toBe(
      'pg-lite',
    );
  });

  it('treats files outside node_modules as the project’s own code', () => {
    expect(resolver.packageFor('src/index.ts')).toBeUndefined();
  });

  it('names a package from its path when no manifest is found', () => {
    expect(resolver.packageFor(path.join('node_modules', 'not-installed', 'index.js'))).toEqual({
      name: 'not-installed',
      version: undefined,
    });
  });

  it('does not name a package after a dot folder in node_modules', () => {
    expect(
      resolver.packageFor(path.join('node_modules', '.cache', 'nuxt', 'x.js')),
    ).toBeUndefined();
  });
});

describe('formatting packages', () => {
  it('appends the version when there is one', () => {
    expect(formatPackage({ name: 'chokidar', version: '4.0.1' })).toBe('chokidar@4.0.1');
    expect(formatPackage({ name: 'chokidar', version: undefined })).toBe('chokidar');
  });
});
