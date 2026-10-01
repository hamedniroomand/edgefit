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
