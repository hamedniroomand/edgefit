import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import { NativePackages } from '@/core/native-packages.ts';

function install(
  root: string,
  name: string,
  manifest: object,
  files: Record<string, string> = {},
): void {
  const directory = path.join(root, 'node_modules', name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', main: 'index.js', ...manifest }),
  );
  writeFileSync(path.join(directory, 'index.js'), files['index.js'] ?? 'module.exports = 1;\n');
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    writeFileSync(path.join(directory, file), text);
  }
}

function importing(names: readonly string[]): Parameters<NativePackages['specifiers']>[1] {
  return {
    imports: [],
    links: [
      ...names.map(name => ({
        path: `node_modules/${name}/index.js`,
        original: `${name}/lib/index.js`,
        kind: 'import-statement',
      })),
      { path: 'node_modules/gyp-file/index.js', original: undefined, kind: 'import-statement' },
    ],
    externals: [],
    missingPeers: [],
  };
}

function nativeNames(
  root: string,
  names: readonly string[],
  finders: readonly string[] = [],
): string[] {
  const packages = new NativePackages(root);
  packages.findBy(finders.map(name => `node_modules/${name}/index.js`));
  return [...packages.specifiers('src/index.ts', importing(names)).values()];
}

function installFixtures(root: string): void {
  install(root, 'gyp-file', { gypfile: true });
  install(root, 'pre-gyp-binary', { binary: { module_path: './lib' } });
  install(root, 'install-script', { scripts: { install: 'prebuild-install || node-gyp rebuild' } });
  install(root, 'loader-user', { dependencies: { 'node-gyp-build': '^4.0.0' } });
  install(root, 'node-gyp-build', {});
  install(root, 'platform-root', { optionalDependencies: { 'platform-root-linux-x64': '1.0.0' } });
  install(root, 'platform-root-linux-x64', {}, { 'prebuilds/addon.node': '' });
  install(root, 'platform-empty', {
    optionalDependencies: { 'platform-empty-linux-x64': '1.0.0' },
  });
  install(root, 'platform-empty-linux-x64', {});
  install(root, 'platform-missing', {
    optionalDependencies: { 'platform-missing-linux-x64': '1.0.0' },
  });
  install(root, 'broken', {});
  writeFileSync(path.join(root, 'node_modules/broken/package.json'), '{');
  install(root, 'plain', { scripts: { install: 'echo done' }, dependencies: { lodash: '1' } });
}

describe('native addon packages', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'edgefit-native-'));
  installFixtures(root);

  it.each(['gyp-file', 'pre-gyp-binary', 'install-script', 'loader-user'])(
    'shows %s by its package name for an import of a subpath',
    name => {
      expect(nativeNames(root, [name])).toEqual([name]);
    },
  );

  it.each(['plain', 'platform-empty', 'platform-missing', 'node-gyp-build', 'broken'])(
    'records nothing for %s',
    name => {
      expect(nativeNames(root, [name], [name])).toEqual([]);
    },
  );

  it('counts a platform package that the package finds by a computed require', () => {
    expect(nativeNames(root, ['platform-root'], ['platform-root'])).toEqual(['platform-root']);
  });

  it('leaves out a platform package that the package does not find by a computed require', () => {
    expect(nativeNames(root, ['platform-root'])).toEqual([]);
  });

  it('covers the files of a loader and of a native package', () => {
    const packages = new NativePackages(root);
    expect(packages.covers('node_modules/node-gyp-build/index.js')).toBe(true);
    expect(packages.covers('node_modules/gyp-file/index.js')).toBe(true);
    expect(packages.covers('node_modules/plain/index.js')).toBe(false);
    expect(packages.covers('node_modules/broken/index.js')).toBe(false);
    expect(packages.covers('src/index.ts')).toBe(false);
  });
});

async function apiOf(
  project: string,
  target: 'workerd' | 'bun',
  guarded: boolean,
): Promise<string[]> {
  const result = await check({
    root: project,
    config: { targets: [target], entry: 'src/index.ts' },
  });
  const [report] = result.reports;
  return (guarded ? report?.guarded : report?.findings)?.map(item => item.api) ?? [];
}

describe('native addon imports', () => {
  const project = mkdtempSync(path.join(tmpdir(), 'edgefit-native-app-'));
  install(
    project,
    'addon-user',
    { dependencies: { 'node-gyp-build': '^4.0.0' } },
    {
      'index.js': "module.exports = require('./load.js');\n",
      'load.js': 'module.exports = name => require(name);\n',
    },
  );
  install(project, 'node-gyp-build', {});
  mkdirSync(path.join(project, 'src'));
  writeFileSync(
    path.join(project, 'src/index.ts'),
    "import user from 'addon-user';\nexport { user };\n",
  );

  it('fails workerd on the import and drops the computed require of the loader', async () => {
    expect(await apiOf(project, 'workerd', false)).toEqual(['native addon addon-user']);
    expect(await apiOf(project, 'bun', false)).toEqual([]);
  });

  it('guards the import when a try block catches its error', async () => {
    writeFileSync(
      path.join(project, 'src/index.ts'),
      "let user;\ntry {\n  user = require('addon-user');\n} catch {\n  user = null;\n}\nexport { user };\n",
    );
    expect(await apiOf(project, 'workerd', false)).toEqual([]);
    expect(await apiOf(project, 'workerd', true)).toEqual(['native addon addon-user']);
    expect(await apiOf(project, 'bun', false)).toEqual([]);
  });
});
