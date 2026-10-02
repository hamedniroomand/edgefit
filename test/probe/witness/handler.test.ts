import type { WitnessOptions } from '@scripts/probe/witness/handler.mjs';
import { observe, respond } from '@scripts/probe/witness/handler.mjs';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

const options: WitnessOptions = {
  entry: 'middleware',
  spec: {
    hash: 'abc',
    apis: [
      { api: 'buffer.Buffer', lookup: true },
      { api: 'fs.readFile', lookup: true },
    ],
    globals: [],
  },
  checks: { ok: (): number => 1 },
  load: (name: string): unknown => ({ buffer: { Buffer: 1 } })[name],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('observe', () => {
  it('reports the lookups, the checks and the global names', async () => {
    const results = await observe(options);
    expect(results).toMatchObject({
      entry: 'middleware',
      specHash: 'abc',
      types: {},
      deno: null,
      outcomes: { 'buffer.Buffer': 'present', 'fs.readFile': 'missing' },
      checks: { ok: { allowed: true } },
    });
    expect(results.names).toContain('globalThis');
    expect(results.names).not.toContain('constructor');
  });

  it('takes the Deno version from the user agent when Deno hides it', async () => {
    vi.stubGlobal('Deno', { version: { deno: '' } });
    vi.stubGlobal('navigator', { userAgent: 'Deno/2.4.3' });
    const results = await observe(options);
    expect(results.deno).toBe('2.4.3');
    expect(results.runtime).toMatchObject({ denoVersion: { deno: '' }, userAgent: 'Deno/2.4.3' });
  });

  it('answers with JSON that is never cached', async () => {
    const response = await respond(options);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ specHash: 'abc' });
  });
});
