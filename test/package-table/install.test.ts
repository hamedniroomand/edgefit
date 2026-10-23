import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { install } from '@scripts/package-table/verify/install.mjs';
import type { NpmInstall } from '@scripts/package-table/verify/install.mjs';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

const manifest = {
  name: 'zustand',
  peerDependencies: { react: '>=18.0.0', immer: '>=9.0.6', '@opentelemetry/api': '^1.2.0' },
  peerDependenciesMeta: {
    react: { optional: true },
    immer: { optional: true },
    '@opentelemetry/api': { optional: true },
    // Marked optional, but the package gives no range for it.
    canvas: { optional: true },
  },
};
const note = (peer: string): string => `peer ${peer} not installed, checked in your project`;

/**
 * A fake `npm install`. A call with no arguments installs the package. Each other call installs
 * one peer, and fails for a peer in `failing`.
 */
function fakeNpm(failing: string[] = []): { calls: string[][]; run: NpmInstall } {
  const calls: string[][] = [];
  const run: NpmInstall = (directory, args = []) => {
    calls.push(args);
    if (args.length === 0) {
      mkdirSync(path.join(directory, 'node_modules', 'zustand'), { recursive: true });
      writeFileSync(
        path.join(directory, 'node_modules', 'zustand', 'package.json'),
        JSON.stringify(manifest),
      );
    }
    const [spec = ''] = args;
    return failing.some(peer => spec.startsWith(`${peer}@`)) ? 'No matching version' : undefined;
  };
  return { calls, run };
}

const work = (): string => mkdtempSync(path.join(tmpdir(), 'edgefit-install-'));
const installWith = (notes: string[], run: NpmInstall): ReturnType<typeof install> =>
  install(work(), 'zustand', 'zustand', '5.0.15', notes, run);

describe('the install of the peers that a note names', () => {
  it('installs each named peer at the range of the package, and lists the others', () => {
    const { calls, run } = fakeNpm();
    const installed = installWith([note('react'), note('@opentelemetry/api')], run);
    expect(calls).toEqual([[], ['react@>=18.0.0'], ['@opentelemetry/api@^1.2.0']]);
    expect(installed).toMatchObject({ optionalPeers: ['immer', 'canvas'], peerFailures: [] });
  });

  it('installs no peer for a row without a peer note', () => {
    const { calls, run } = fakeNpm();
    const installed = installWith(['loads a module the user names (view.js:81)'], run);
    expect(calls).toEqual([[]]);
    expect(installed).toMatchObject({
      optionalPeers: ['react', 'immer', '@opentelemetry/api', 'canvas'],
      peerFailures: [],
    });
  });
});

describe('a peer that a note names and that does not install', () => {
  it('stays in the list with the error, and the other peers still install', () => {
    const { calls, run } = fakeNpm(['react']);
    const installed = installWith([note('react'), note('@opentelemetry/api')], run);
    expect(calls).toHaveLength(3);
    expect(installed).toMatchObject({
      optionalPeers: ['react', 'immer', 'canvas'],
      peerFailures: ['react: No matching version'],
    });
  });

  it('fails when the package gives no range for it, or does not declare it', () => {
    const { calls, run } = fakeNpm();
    const installed = installWith([note('canvas'), note('left-pad')], run);
    expect(calls).toEqual([[]]);
    expect(installed).toMatchObject({
      peerFailures: [
        'canvas: the package gives no range for it',
        'left-pad: the package gives no range for it',
      ],
    });
  });

  it('gives the error of an install of the package that fails', () => {
    expect(installWith([], () => 'no network')).toEqual({
      error: 'npm install failed: no network',
    });
  });
});

describe('the environment of the install of a package', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // A `npm` in front of the real one in PATH records the variables that it gets, one line for each
  // call, and installs the package. The fake is a shell script, and `spawnSync('npm')` cannot start
  // `npm.cmd` on Windows.
  it.skipIf(process.platform === 'win32')(
    'skips the browser download of puppeteer for each install, also when the user turned it on',
    () => {
      const bin = mkdtempSync(path.join(tmpdir(), 'edgefit-npm-'));
      const recorded = path.join(bin, 'recorded');
      const script = `#!/bin/sh\nprintf '%s:%s\\n' "$PUPPETEER_SKIP_DOWNLOAD" "$EDGEFIT_INSTALL_MARKER" >> "${recorded}"\nmkdir -p node_modules/zustand\nprintf '%s' '${JSON.stringify(manifest)}' > node_modules/zustand/package.json\n`;
      writeFileSync(path.join(bin, 'npm'), script);
      chmodSync(path.join(bin, 'npm'), 0o755);
      vi.stubEnv('PATH', `${bin}${path.delimiter}${process.env.PATH ?? ''}`);
      vi.stubEnv('PUPPETEER_SKIP_DOWNLOAD', 'false');
      vi.stubEnv('EDGEFIT_INSTALL_MARKER', 'kept');
      const installed = install(work(), 'zustand', 'zustand', '5.0.15', [note('react')]);
      expect(installed).toMatchObject({ peerFailures: [] });
      // One call installs the package, and one installs the peer.
      expect(readFileSync(recorded, 'utf8')).toBe('true:kept\ntrue:kept\n');
    },
  );
});
