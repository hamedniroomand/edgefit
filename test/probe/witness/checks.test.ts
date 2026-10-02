import { createRequire } from 'node:module';

import {
  denoChecks,
  dynamicChecks,
  runChecks,
  vercelChecks,
} from '@scripts/probe/witness/checks.mjs';
import { describe, expect, it, vi } from 'vite-plus/test';

describe('runChecks', () => {
  it('allows dynamic code under Node', async () => {
    expect(await runChecks(dynamicChecks)).toEqual({
      eval: { allowed: true },
      newFunction: { allowed: true },
      wasmFromBytes: { allowed: true },
      wasmInstantiateFromBytes: { allowed: true },
    });
  });

  it('records the text a check returns', async () => {
    vi.stubGlobal('require', createRequire(import.meta.url));
    expect(await runChecks(vercelChecks)).toEqual({
      requireBuffer: { allowed: true, value: 'object' },
    });
    vi.unstubAllGlobals();
  });

  it('records the error of a check that throws', async () => {
    const results = await runChecks(denoChecks);
    expect(results.runPermission?.allowed).toBe(false);
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
