import type { WitnessOptions } from '@scripts/probe/witness/handler.mjs';
import { observe, respond } from '@scripts/probe/witness/handler.mjs';
import { describe, expect, it } from 'vite-plus/test';

const options: WitnessOptions = {
  entry: 'middleware',
  spec: {
    hash: 'abc',
    apis: [
      { api: 'buffer.Buffer', lookup: true },
      { api: 'fs.readFile', lookup: true },
    ],
  },
  checks: { ok: (): number => 1 },
  load: (name: string): unknown => ({ buffer: { Buffer: 1 } })[name],
};

describe('observe', () => {
  it('reports the lookups, the checks and the global names', async () => {
    const results = await observe(options);
    expect(results).toMatchObject({
      entry: 'middleware',
      specHash: 'abc',
      deno: null,
      outcomes: { 'buffer.Buffer': 'present', 'fs.readFile': 'missing' },
      checks: { ok: { allowed: true } },
    });
    expect(results.names).toContain('globalThis');
    expect(results.names).not.toContain('constructor');
  });

  it('answers with JSON that is never cached', async () => {
    const response = await respond(options);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ specHash: 'abc' });
  });
});
