import {
  errorText,
  isNetwork,
  judge,
  missingPackage,
} from '@scripts/package-table/verify/judge.mjs';
import type { RowFinding, RunError } from '@scripts/package-table/verify/judge.mjs';
import { describe, expect, it } from 'vite-plus/test';

const error = (fields: Partial<RunError>): RunError => ({ ok: false, ...fields });
const watch: RowFinding = {
  api: 'node:fs.watch',
  category: 'unsupported',
  level: 'error',
  detail: 'throws ERR_UNSUPPORTED_OPERATION',
};
const ok = { ok: true } as const;

describe('a pass row', () => {
  it('is verified when its main entry loads', () => {
    expect(judge({ status: 'pass', run: { load: ok }, findings: [] })).toEqual({
      outcome: 'verified',
      kind: 'load',
    });
  });

  it('is a mismatch when its main entry throws', () => {
    const run = { load: error({ name: 'TypeError', message: 'x is not a function' }) };
    expect(judge({ status: 'pass', run, findings: [] })).toEqual({
      outcome: 'mismatch',
      kind: 'load',
      error: 'TypeError: x is not a function',
    });
  });

  it('is absent when the bundle of the run fails', () => {
    const run = {
      load: error({ name: 'BundleError', message: 'Could not resolve "optional-peer"' }),
    };
    expect(judge({ status: 'pass', run, findings: [] })).toMatchObject({
      outcome: 'absent',
      reason: 'bundle',
    });
  });

  it('is absent when the load fails on a bundle artifact', () => {
    const run = { load: error({ message: '__dirname is not defined' }) };
    expect(judge({ status: 'pass', run, findings: [] })).toMatchObject({
      outcome: 'absent',
      reason: 'bundle',
    });
  });
});

describe('a fail row', () => {
  it('is absent when the load succeeds and there is no reach script', () => {
    expect(judge({ status: 'fail', run: { load: ok }, findings: [watch] })).toMatchObject({
      outcome: 'absent',
      reason: 'lazy finding, no reach script',
    });
  });

  it('is a mismatch when the reach script finishes', () => {
    const cell = judge({ status: 'fail', run: { load: ok, reach: ok }, findings: [watch] });
    expect(cell).toMatchObject({ outcome: 'mismatch', kind: 'reach' });
  });

  it('is confirmed, never verified, when the load fails on a bundle artifact', () => {
    const run = { load: error({ message: 'Dynamic require of "fs" is not supported' }) };
    const cell = judge({ status: 'fail', run, findings: [watch] });
    expect(cell.outcome).toBe('confirmed');
    expect(cell.error).toMatch(/^bundle artifact: /u);
  });

  it('is verified when the bundle fails on the native addon of the finding', () => {
    const addon = { ...watch, api: 'native addon x', detail: 'is a native addon' };
    const run = {
      load: error({ name: 'BundleError', message: 'No loader is configured for ".node" files' }),
    };
    expect(judge({ status: 'fail', run, findings: [addon] })).toMatchObject({
      outcome: 'verified',
      api: 'native addon x',
    });
  });

  it('is absent with the reason network when a reach fails on the network', () => {
    const run = { load: ok, reach: error({ code: 'ENOTFOUND', message: 'getaddrinfo' }) };
    expect(judge({ status: 'fail', run, findings: [watch] })).toMatchObject({
      outcome: 'absent',
      reason: 'network',
    });
  });

  it.each(['warn', 'error', 'unchecked'])('is absent for a %s row', status => {
    expect(judge({ status, run: { load: ok }, findings: [] }).outcome).toBe('absent');
  });
});

describe('the network rule', () => {
  it('reads a network code anywhere in the chain', () => {
    expect(
      isNetwork(error({ message: 'fetch failed', cause: error({ code: 'ECONNRESET' }) })),
    ).toBe(true);
  });

  it('reads a bare fetch failed as the network', () => {
    expect(isNetwork(error({ message: 'fetch failed' }))).toBe(true);
  });

  it('does not read fetch failed with a cause from the runtime as the network', () => {
    const cause = error({ code: 'ERR_OPTION_NOT_IMPLEMENTED', message: 'not implemented' });
    expect(isNetwork(error({ message: 'fetch failed', cause }))).toBe(false);
  });
});

describe('the text of an error', () => {
  it('falls back to the name, then to Error, and leaves out a missing frame', () => {
    expect(errorText(error({ name: 'RangeError', message: 'bad' }))).toBe('RangeError: bad');
    expect(errorText(error({}))).toBe('Error: ');
  });
});

describe('a load that needs a package that is not installed', () => {
  const bun = error({
    code: 'ERR_MODULE_NOT_FOUND',
    message: "Cannot find package 'react' imported from /tmp/zustand/index.js",
  });
  const deno = error({
    message: "Could not find package 'react' from referrer 'file:///tmp/x.js'",
  });

  it.each([bun, deno])('is absent when the package is an optional peer', thrown => {
    const cell = judge({
      status: 'pass',
      run: { load: thrown },
      findings: [],
      optionalPeers: ['react'],
    });
    expect(cell).toMatchObject({ outcome: 'absent', reason: 'peer not installed' });
  });

  it('is a mismatch when the package is a regular dependency', () => {
    expect(
      judge({ status: 'pass', run: { load: bun }, findings: [], optionalPeers: [] }).outcome,
    ).toBe('mismatch');
  });

  it('reads the package of a subpath and of a scoped name', () => {
    expect(missingPackage(error({ message: "Cannot find module 'react/jsx-runtime'" }))).toBe(
      'react',
    );
    expect(missingPackage(error({ message: "Cannot find package '@scope/name/sub'" }))).toBe(
      '@scope/name',
    );
    expect(missingPackage(error({ message: 'boom' }))).toBeUndefined();
  });
});
