import { denoChecks, dynamicChecks, runChecks } from '@scripts/probe/witness/checks.mjs';
import { describe, expect, it } from 'vite-plus/test';

describe('runChecks', () => {
  it('allows dynamic code under Node', async () => {
    expect(await runChecks(dynamicChecks)).toEqual({
      eval: { allowed: true },
      newFunction: { allowed: true },
      wasmFromBytes: { allowed: true },
    });
  });

  it('records the error of a check that throws', async () => {
    const results = await runChecks(denoChecks);
    expect(results.subprocess).toEqual({
      allowed: false,
      error: 'ReferenceError: Deno is not defined',
    });
  });

  it('records the error of a custom check', async () => {
    const results = await runChecks({
      write: (): never => {
        throw new TypeError('blocked');
      },
    });
    expect(results).toEqual({ write: { allowed: false, error: 'TypeError: blocked' } });
  });
});
