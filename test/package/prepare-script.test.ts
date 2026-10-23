import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { checkPackage } from '@/package/check-package.ts';
import { packageFlowTimeout } from '~/helpers.ts';

let source: string;
let markerDirectory: string;
const writeJson = (file: string, value: unknown): void => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
};

beforeEach(() => {
  source = mkdtempSync(path.join(tmpdir(), 'edgefit-prepare-'));
  markerDirectory = mkdtempSync(path.join(tmpdir(), 'edgefit-marker-'));
  writeFileSync(path.join(source, 'index.js'), 'export const ready = true;\n');
});
afterEach(() => {
  rmSync(source, { recursive: true, force: true });
  rmSync(markerDirectory, { recursive: true, force: true });
});

describe('checkPackage on a directory', { timeout: packageFlowTimeout }, () => {
  // npm 10 runs `prepare` in `npm pack` even with `--ignore-scripts`. npm 11 does not, so this
  // test shows the fix only when npm is version 10, as on the Node 22 job of the CI. The script
  // runs in the folder that npm packs, which is a copy, so the marker has an absolute path.
  it('does not run the prepare script of the package', async () => {
    const marker = path.join(markerDirectory, 'marker.txt').replaceAll('\\', '/');
    writeJson(path.join(source, 'package.json'), {
      name: 'edgefit-fixture-prepare',
      version: '1.0.0',
      type: 'module',
      main: './index.js',
      scripts: { prepare: `node -e "require('fs').writeFileSync('${marker}', 'ran')"` },
    });
    const result = await checkPackage(source, { targets: ['workerd'] });
    expect(result.package).toBe('edgefit-fixture-prepare');
    expect(existsSync(marker)).toBe(false);
  });

  it('keeps the bundled dependencies of the package', async () => {
    writeJson(path.join(source, 'package.json'), {
      name: 'edgefit-fixture-bundled',
      version: '1.0.0',
      type: 'module',
      main: './index.js',
      bundleDependencies: ['edgefit-bundled'],
      dependencies: { 'edgefit-bundled': '1.0.0' },
    });
    writeJson(path.join(source, 'node_modules', 'edgefit-bundled', 'package.json'), {
      name: 'edgefit-bundled',
      version: '1.0.0',
    });
    let kept = '';
    await checkPackage(source, {
      targets: ['workerd'],
      keep: true,
      onKeep: directory => {
        kept = directory;
      },
    });
    const installed = path.join(kept, 'node_modules', 'edgefit-fixture-bundled');
    expect(existsSync(path.join(installed, 'node_modules', 'edgefit-bundled'))).toBe(true);
    rmSync(kept, { recursive: true, force: true });
  });
});
