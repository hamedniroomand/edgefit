import { witnessSpec } from '@scripts/probe/witness/spec.mjs';
import { describe, expect, it } from 'vite-plus/test';

describe('witnessSpec', () => {
  it('looks up the Node baseline on Netlify, as the netlify-min probe does', () => {
    const { apis } = witnessSpec('netlify');
    const names = apis.map(({ api }) => api);
    expect(names).toContain('buffer.Buffer');
    expect(names).toContain('fs.readFile');
    expect(names).toEqual([...names].sort());
    expect(apis.every(({ lookup }) => lookup === true)).toBe(true);
  });

  it('looks up only the members of the allowed modules on Vercel', () => {
    const names = witnessSpec('vercel').apis.map(({ api }) => api);
    expect(names).toContain('buffer.Buffer');
    expect(names).toContain('*globals*.process.env');
    expect(witnessSpec('vercel').globals).toContain('fetch');
    expect(witnessSpec('vercel').globals).not.toContain('undefined');
    expect(witnessSpec('netlify').globals).toEqual([]);
    expect(names).not.toContain('fs');
  });

  it('gives each list its own stable hash', () => {
    expect(witnessSpec('netlify').hash).toBe(witnessSpec('netlify').hash);
    expect(witnessSpec('netlify').hash).not.toBe(witnessSpec('vercel').hash);
  });
});
