import { describe, expect, it } from 'vite-plus/test';

import { createTarget } from '@/targets/index.ts';
import type { Target } from '@/targets/index.ts';
import type { TargetKey } from '@/types.ts';

const targetOf = (key: TargetKey): Target => createTarget(key, import.meta.dirname, {});
const statusOf = (key: TargetKey, module: string, ...path: string[]): string =>
  targetOf(key).lookup({ module, path }).status;

describe('a member that the data does not list, on a real target', () => {
  it('is unsupported below a parent that the target lacks', () => {
    expect(statusOf('workerd', '*globals*', 'navigator', 'locks', 'zzzq')).toBe('unsupported');
    expect(statusOf('bun', '*globals*', 'navigator', 'locks', 'zzzq')).toBe('unsupported');
    expect(statusOf('deno', 'process', 'finalization', 'zzzq')).toBe('unsupported');
    expect(statusOf('deno', 'process', 'features', 'zzzq')).toBe('unsupported');
  });

  it('is supported below a parent that the target has', () => {
    expect(statusOf('workerd', 'process', 'finalization', 'zzzq')).toBe('supported');
    expect(statusOf('workerd', 'fs', 'zzzq')).toBe('supported');
    expect(statusOf('deno', '*globals*', 'navigator', 'locks', 'zzzq')).toBe('supported');
  });
});
