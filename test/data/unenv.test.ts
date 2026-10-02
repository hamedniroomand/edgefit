import { describe, expect, it } from 'vite-plus/test';

import { isUnenvConstant } from '@/data/unenv.ts';

describe('isUnenvConstant', () => {
  it('is true for a constant, with or without a default segment, on every call', () => {
    expect(isUnenvConstant({ module: 'os', path: ['EOL'] })).toBe(true);
    expect(isUnenvConstant({ module: 'os', path: ['default', 'EOL'] })).toBe(true);
  });

  it('is false for a function, an unknown module and a path that is not one member', () => {
    expect(isUnenvConstant({ module: 'os', path: ['cpus'] })).toBe(false);
    expect(isUnenvConstant({ module: 'nope', path: ['EOL'] })).toBe(false);
    expect(isUnenvConstant({ module: 'os', path: [] })).toBe(false);
  });
});
