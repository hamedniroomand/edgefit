import type { Outcome } from '@scripts/probe/classify.mjs';
import { matrixHas } from '@scripts/probe/compare.mjs';
import { readMatrix, readOverrides } from '@scripts/probe/data.mjs';
import { compareNetlify, compareVercel } from '@scripts/probe/witness/compare.mjs';
import { witnessSpec } from '@scripts/probe/witness/spec.mjs';
import { describe, expect, it } from 'vite-plus/test';

type VercelResults = Parameters<typeof compareVercel>[0];

const deno = readMatrix('deno');
const netlifyData = { deno: '2.4.2', overrides: readOverrides('deno'), matrix: deno };
// What a witness on the Deno release of the data would answer.
const asDeno = (): Record<string, Outcome> =>
  Object.fromEntries(
    witnessSpec('netlify').apis.map(({ api }) => [
      api,
      matrixHas(deno, api) ? 'present' : 'missing',
    ]),
  );

describe('compareNetlify', () => {
  it('finds no disagreement when Netlify runs the Deno of the data', () => {
    expect(compareNetlify({ deno: '2.4.2', outcomes: asDeno(), checks: {} }, netlifyData)).toEqual({
      sections: [],
      lines: [],
    });
  });

  it('says when Netlify hides its version', () => {
    const { sections } = compareNetlify(
      { deno: null, outcomes: asDeno(), checks: {} },
      netlifyData,
    );
    expect(sections).toEqual([
      {
        title: 'Netlify does not report its Deno version (read `runtime` in witness.json)',
        items: ['The data keeps the bundler minimum, 2.4.2'],
      },
    ]);
  });

  it('reports the version, and an API that Netlify lacks', () => {
    const outcomes = { ...asDeno(), 'fs.readFile': 'missing' as const };
    const { sections, lines } = compareNetlify(
      { deno: '2.5.0', outcomes, checks: {} },
      netlifyData,
    );
    expect(sections).toEqual([
      {
        title: 'Deno version (update the netlify-edge version in data/source.json)',
        items: ['Netlify runs 2.5.0, the data records 2.4.2'],
      },
    ]);
    expect(lines.join('\n')).toContain('fs.readFile');
  });

  it('reports only the import error when no module loads', () => {
    const outcomes = { 'fs.readFile': 'missing' as const };
    const checks = { nodeImport: { allowed: false, error: 'TypeError: blocked' } };
    const { sections, lines } = compareNetlify({ deno: '2.4.2', outcomes, checks }, netlifyData);
    expect(sections.map(({ items }) => items)).toEqual([['TypeError: blocked']]);
    expect(lines).toEqual([]);
  });
});

describe('compareVercel', () => {
  const blocked = new Set(['*globals*.eval']);
  const accepted = new Set(['fetch', 'Buffer', 'eval']);
  const data = { blocked, accepted, useNames: true };

  it('finds no disagreement when Vercel matches the allowlist', () => {
    const results: VercelResults = {
      names: ['fetch', 'Buffer', '__plumbing', 'addEventListener', 'gc', 'require'],
      types: {
        fetch: 'function',
        eval: 'undefined',
        Float16Array: 'undefined',
        require: 'function',
      },
      outcomes: { 'buffer.Buffer': 'present' },
      checks: { eval: { allowed: false }, newFunction: { allowed: false } },
    };
    expect(compareVercel(results, data)).toEqual([]);
  });

  it('reports missing globals and members, extra globals and allowed dynamic code', () => {
    const results: VercelResults = {
      names: ['fetch', 'setImmediate'],
      types: { fetch: 'function', Buffer: 'undefined', Float16Array: 'function' },
      outcomes: { 'util.types': 'missing' },
      checks: { eval: { allowed: true }, wasmInstantiateFromBytes: { allowed: true } },
    };
    expect(compareVercel(results, data)).toEqual([
      { title: 'Kept in the data, missing on Vercel', items: ['Buffer', 'util.types'] },
      { title: 'On Vercel, not kept in the data', items: ['Float16Array', 'setImmediate'] },
      {
        title: 'Dynamic code that the docs disable but Vercel allows',
        items: ['WebAssembly.instantiate from bytes', 'eval'],
      },
    ]);
  });

  it('takes extras from typeof only, for an entry that hides its names', () => {
    const results: VercelResults = {
      names: ['caches'],
      types: { AsyncLocalStorage: 'function' },
      outcomes: {},
      checks: {},
    };
    expect(compareVercel(results, { ...data, useNames: false })).toEqual([
      { title: 'On Vercel, not kept in the data', items: ['AsyncLocalStorage'] },
    ]);
  });
});
