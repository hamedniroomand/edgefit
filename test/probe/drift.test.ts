import { compareOutcomes, matrixHas } from '@scripts/probe/compare.mjs';
import { compatibilityDateFor, driftFor, missingApis, renderIssue } from '@scripts/probe/drift.mjs';
import { probeApi } from '@scripts/probe/probe.mjs';
import { describe, expect, it } from 'vite-plus/test';

const runtime = {
  '*globals*': {
    BroadcastChannel: 'missing',
    global: { BroadcastChannel: 'missing', crypto: { subtle: { getPublicKey: 'missing' } } },
    globalThis: { BroadcastChannel: 'missing' },
    crypto: { subtle: { getPublicKey: 'missing', digest: 'function', '*self*': 'object' } },
    Retired: 'missing',
  },
  fs: { '*self*': 'object', watch: 'missing', readFile: 'function', cp: 'missing' },
  sqlite: 'missing',
  test: { '*self*': 'missing' },
  vm: { '*self*': 'object', runInContext: 'function' },
  constants: { '*self*': 'object', default: { '*self*': 'object' } },
};
const baseline = {
  '*globals*': {
    BroadcastChannel: 'class',
    crypto: { subtle: { getPublicKey: 'function', digest: 'function', '*self*': 'object' } },
    Retired: 'missing',
  },
  fs: { '*self*': 'object', watch: 'function', readFile: 'function', cp: 'function' },
  sqlite: 'object',
  test: { '*self*': 'function' },
  vm: { '*self*': 'object', runInContext: 'function' },
  constants: { '*self*': 'object', ENGINE: 'number', default: { ENGINE: 'number' } },
};
const overrides = { 'fs.cp': { status: 'unsupported', note: '', source: '' } };

describe('missingApis', () => {
  it('lists what the data marks missing and Node has, once, without overridden APIs', () => {
    expect(missingApis(runtime, baseline, overrides)).toEqual([
      '*globals*.BroadcastChannel',
      '*globals*.crypto.subtle.getPublicKey',
      'constants.ENGINE',
      'fs.watch',
      'sqlite',
      'test',
    ]);
  });

  it('leaves out APIs that Node itself does not have', () => {
    expect(missingApis(runtime, baseline, overrides)).not.toContain('*globals*.Retired');
  });
});

describe('matrixHas', () => {
  it('does not count an entry marked missing as present', () => {
    expect(matrixHas(runtime, 'fs.watch')).toBe(false);
    expect(matrixHas(runtime, 'fs.readFile')).toBe(true);
    expect(matrixHas(runtime, 'test')).toBe(false);
    expect(matrixHas(runtime, 'fs.nothing')).toBe(false);
  });
});

describe('probing a lookup', () => {
  it('finds a global member and reports one that is missing', async () => {
    expect(await probeApi({ api: '*globals*.crypto.subtle.digest', lookup: true })).toBe('present');
    expect(await probeApi({ api: '*globals*.crypto.subtle.nothing', lookup: true })).toBe(
      'missing',
    );
    expect(await probeApi({ api: '*globals*.noSuchGlobal', lookup: true })).toBe('missing');
  });

  it('finds a module and a member of it without calling anything', async () => {
    expect(await probeApi({ api: 'sqlite', lookup: true })).toBe('present');
    expect(await probeApi({ api: 'fs.readFile', lookup: true })).toBe('present');
    expect(await probeApi({ api: 'fs.nothing', lookup: true })).toBe('missing');
  });
});

describe('an exact lookup', () => {
  // A module whose namespace lacks `Assert` while its default export has it, like Deno's assert/strict.
  const load = (): unknown => ({ default: { Assert: class {} }, other: () => 1 });

  it('does not fall back to the default export', async () => {
    expect(await probeApi({ api: 'assert.Assert', lookup: true }, load)).toBe('missing');
    expect(await probeApi({ api: 'assert.other', lookup: true }, load)).toBe('present');
  });

  it('finds the member through the default export when asked for it', async () => {
    expect(await probeApi({ api: 'assert.default.Assert', lookup: true }, load)).toBe('present');
  });

  it('keeps the fallback when a function is called', async () => {
    expect(await probeApi({ api: 'assert.Assert', kind: 'class' }, load)).toBe('inconclusive');
  });
});

describe('driftFor and stubs that validate first', () => {
  const overrides = {
    'vm.compileFunction': { status: 'unsupported', note: '', source: '', validatesFirst: true },
    'vm.other': { status: 'unsupported', note: '', source: '' },
  };
  const outcomes = { 'vm.compileFunction': 'implemented', 'vm.other': 'implemented' };

  it('ignores an argument error from a stub known to validate first', () => {
    const drift = driftFor({
      runtime: 'workerd',
      pinned: '1',
      latest: '2',
      outcomes,
      mocked: {},
      overrides,
    });
    expect(drift.stubsNowWork).toEqual(['vm.other']);
  });
});

describe('compareOutcomes for stubs', () => {
  const stub = { status: 'unsupported', note: '', source: '' };

  it('does not treat an inconclusive call as a sign that a stub works', () => {
    expect(compareOutcomes({ 'a.b': 'inconclusive' }, { 'a.b': stub }, {})).toEqual([]);
  });

  it('does not compare a partial implementation with a bare call', () => {
    const partial = { status: 'mismatch', note: '', source: '' };
    expect(compareOutcomes({ 'a.b': 'unsupported' }, { 'a.b': partial }, {})).toEqual([]);
  });

  it('accepts an argument error from a stub that validates first, but not from another', () => {
    const outcomes = { 'a.b': 'implemented' };
    expect(compareOutcomes(outcomes, { 'a.b': { ...stub, validatesFirst: true } }, {})).toEqual([]);
    expect(compareOutcomes(outcomes, { 'a.b': stub }, {})).toHaveLength(1);
  });
});

describe('compatibilityDateFor', () => {
  it('reads the date from a workerd version', () => {
    expect(compatibilityDateFor('1.20260924.0')).toBe('2026-09-24');
  });

  it('gives nothing for a version without a date', () => {
    expect(compatibilityDateFor('latest')).toBeUndefined();
    expect(compatibilityDateFor('1.2.3')).toBeUndefined();
  });
});

const outcomes = {
  '*globals*.crypto.subtle.getPublicKey': 'present',
  'fs.watch': 'missing',
  'v8.takeCoverage': 'implemented',
  'v8.setFlagsFromString': 'unsupported',
};
const curated = {
  'v8.takeCoverage': { status: 'unsupported', note: '', source: '' },
  'v8.setFlagsFromString': { status: 'unsupported', note: '', source: '' },
};

describe('driftFor', () => {
  const drift = driftFor({
    runtime: 'workerd',
    pinned: '1.20260424.1',
    latest: '1.20260924.0',
    outcomes,
    mocked: { 'a.b': 'implemented', 'a.c': 'noop' },
    overrides: curated,
  });

  it('separates APIs the data marks missing from curated stubs that work', () => {
    expect(drift.nowPresent).toEqual(['*globals*.crypto.subtle.getPublicKey']);
    expect(drift.stubsNowWork).toEqual(['v8.takeCoverage']);
    expect(drift.mocksImplemented).toEqual(['a.b']);
  });

  it('does not count an inconclusive probe as a stub that works', () => {
    const inconclusive = driftFor({
      runtime: 'workerd',
      pinned: '1',
      latest: '2',
      outcomes: { 'vm.Script': 'inconclusive', 'vm.compileFunction': 'implemented' },
      mocked: {},
      overrides: {
        'vm.Script': { status: 'unsupported', note: '', source: '' },
        'vm.compileFunction': { status: 'unsupported', note: '', source: '' },
      },
    });
    expect(inconclusive.stubsNowWork).toEqual(['vm.compileFunction']);
  });

  it('keeps the versions', () => {
    expect(drift).toMatchObject({
      runtime: 'workerd',
      pinned: '1.20260424.1',
      latest: '1.20260924.0',
    });
  });
});

describe('renderIssue', () => {
  const drift = driftFor({
    runtime: 'workerd',
    pinned: '1.20260424.1',
    latest: '1.20260924.0',
    outcomes,
    mocked: {},
    overrides: curated,
  });
  const clean = driftFor({
    runtime: 'bun',
    pinned: '1.3.0',
    latest: '1.3.0',
    outcomes: {},
    mocked: {},
    overrides: {},
  });

  it('lists what changed per runtime, with the marker used to find the issue again', () => {
    const { body, drift: found } = renderIssue([drift, clean]);
    expect(found).toBe(true);
    expect(body).toContain('<!-- edgefit-data-drift -->');
    expect(body).toContain('### workerd (pinned 1.20260424.1, latest 1.20260924.0)');
    expect(body).toContain('- **globals** (1): `crypto.subtle.getPublicKey`');
    expect(body).toContain('`v8.takeCoverage`');
    expect(body).not.toContain('### bun');
  });

  it('reports no drift when every runtime agrees', () => {
    expect(renderIssue([clean]).drift).toBe(false);
  });
});

describe('renderIssue with many APIs', () => {
  const many = driftFor({
    runtime: 'bun',
    pinned: '1.3.0',
    latest: '1.4.0',
    outcomes: Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [`constants.SSL_${index}`, 'present']),
    ),
    mocked: {},
    overrides: {},
  });

  it('folds a module into one line and says how many more there are', () => {
    const { body } = renderIssue([many]);
    expect(body).toContain('- **constants** (20): `SSL_0`, `SSL_1`');
    expect(body).toContain(', and 8 more');
    expect(body).not.toContain('`SSL_9`');
    expect(body).toContain('`drift.json` artifacts');
  });
});
