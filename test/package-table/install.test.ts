import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { install } from '@scripts/package-table/verify/install.mjs';
import type { NpmInstall } from '@scripts/package-table/verify/install.mjs';
import { describe, expect, it } from 'vite-plus/test';

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
