import { describe, expect, it } from 'vite-plus/test';

import { compareVersions, versionNotes } from '@/targets/runtime-version.ts';

describe('comparing versions', () => {
  it('compares numerically per part', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.2.10', '1.2.9')).toBeGreaterThan(0);
    expect(compareVersions('1.9.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
  });

  it('finds a version inside a longer string and treats others as equal', () => {
    expect(compareVersions('bun@1.3.13', '1.3.14')).toBeLessThan(0);
    expect(compareVersions('latest', '1.0.0')).toBe(0);
  });
});

describe('version notes', () => {
  it('warns when the checked runtime is older than the data', () => {
    expect(versionNotes('Bun', '1.2.0', '1.3.13')).toEqual([
      'Bun 1.2.0 is older than the data (1.3.13); APIs added to Bun since then are reported as supported.',
    ]);
  });

  it('is silent for the same or a newer runtime', () => {
    expect(versionNotes('Bun', '1.3.13', '1.3.13')).toEqual([]);
    expect(versionNotes('Bun', '1.4.0', '1.3.13')).toEqual([]);
  });
});
