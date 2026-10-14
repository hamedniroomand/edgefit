import { describe, expect, it } from 'vite-plus/test';

import { compareVersions, inRange } from '@/data/version-range.ts';

describe('version ranges', () => {
  it('compares versions by number, not by text', () => {
    expect(compareVersions('16.10.0', '16.9.0')).toBeGreaterThan(0);
    expect(compareVersions('16.3.8', '16.3.8')).toBe(0);
    expect(compareVersions('16.3.8', '17.0.0')).toBeLessThan(0);
    expect(compareVersions('16', '16.0.0')).toBe(0);
    expect(compareVersions('16.0.0', '16')).toBe(0);
  });

  it('keeps a pre-release out of a range that ends in its major and minor', () => {
    expect(inRange('16.4.0-canary.5', { min: '16.3.8', max: '16.4.0' })).toBe(false);
    expect(inRange('16.3.9-canary.1', { min: '16.3.8', max: '16.4.0' })).toBe(false);
    expect(inRange('16.4.0-canary.5', { min: '16.0.0', max: '17.0.0' })).toBe(true);
  });
});
