import { buildSpec } from '@scripts/probe/apis.mjs';
import { describe, expect, it } from 'vite-plus/test';

describe('buildSpec', () => {
  it('looks up, and never calls, every baseline API without an override in presence mode', () => {
    const { apis, mocked } = buildSpec('deno', { presence: true });
    expect(apis.length).toBeGreaterThan(1000);
    expect(apis.every(entry => entry.lookup === true)).toBe(true);
    expect(mocked).toEqual([]);
    // `v8.takeCoverage` is a curated stub on Deno, so its override decides, not a lookup.
    expect(apis.map(entry => entry.api)).not.toContain('v8.takeCoverage');
    expect(apis.map(entry => entry.api)).toContain('assert.partialDeepStrictEqual');
  });

  it('keeps the curated APIs in the default spec', () => {
    const { apis } = buildSpec('deno');
    expect(apis.some(entry => entry.lookup !== true)).toBe(true);
  });
});

describe('buildSpec drift', () => {
  it('looks up the Web APIs the data marks missing, once each', () => {
    const lookups = buildSpec('workerd', { drift: true }).apis.filter(
      entry => entry.lookup === true,
    );
    const names = lookups.map(entry => entry.api);
    expect(names.some(api => api.startsWith('*globals*.'))).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it('probes an overridden Web API as a call, not a lookup', () => {
    const entry = buildSpec('bun', { drift: true }).apis.find(
      ({ api }) => api === '*globals*.AbortSignal.any',
    );
    expect(entry).toBeDefined();
    expect(entry?.lookup).toBeUndefined();
  });
});

describe('buildSpec drift against the Node baseline', () => {
  const lookups = (runtime: 'bun' | 'deno' | 'workerd'): string[] =>
    buildSpec(runtime, { drift: true })
      .apis.filter(entry => entry.lookup === true)
      .map(entry => entry.api);

  it('leaves out a Web API that the baseline has, as edgefit never reads the data for it', () => {
    // The Web API data lists `URL` as missing on every target, and Node has it.
    expect(lookups('bun')).not.toContain('*globals*.URL');
    expect(lookups('workerd')).not.toContain('*globals*.performance.mark');
  });

  it('keeps a Web API that the baseline lacks', () => {
    // Node has no `caches`, so the data decides it and the probe asks whether it exists now.
    expect(lookups('bun')).toContain('*globals*.caches');
  });
});
