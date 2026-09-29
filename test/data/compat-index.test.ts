import { describe, expect, it } from 'vite-plus/test';

import { CompatIndex } from '@/data/compat-index.ts';
import { findDataDirectory } from '@/data/data-directory.ts';
import { matrixProvider } from '@/data/providers/matrix.ts';
import { overridesProvider } from '@/data/providers/overrides.ts';

const dataDirectory = findDataDirectory();
const data = new CompatIndex(
  matrixProvider('workerd').load(dataDirectory),
  overridesProvider('workerd').load(dataDirectory),
);

function statusOf(module: string, ...path: string[]): string {
  return data.lookup({ module, path }).status;
}

describe('compatibility data lookups', () => {
  it('reports supported APIs', () => {
    expect(statusOf('fs', 'readFileSync')).toBe('supported');
    expect(statusOf('path', 'join')).toBe('supported');
  });

  it('reports APIs missing from the workerd dump as unsupported', () => {
    expect(statusOf('crypto', 'argon2')).toBe('unsupported');
  });

  it('applies curated overrides for APIs that exist but throw', () => {
    expect(statusOf('fs', 'watch')).toBe('unsupported');
    expect(statusOf('fs', 'promises', 'watch')).toBe('unsupported');
    expect(statusOf('child_process', 'exec')).toBe('unsupported');
    expect(data.lookup({ module: 'fs', path: ['watch'] }).source).toContain(
      'internal_fs_callback.ts',
    );
  });

  it('applies curated overrides for APIs that silently do nothing', () => {
    expect(statusOf('dgram', 'createSocket')).toBe('mocked');
  });

  it('treats a default import as the module itself', () => {
    expect(statusOf('fs', 'default', 'watch')).toBe('unsupported');
  });

  it('reports type differences as mismatches', () => {
    expect(statusOf('process', 'release', 'lts')).toBe('mismatch');
  });

  it('does not report members Node itself lacks', () => {
    expect(statusOf('fs', 'notARealApi')).toBe('supported');
  });

  it('reports modules the data does not describe as uncovered', () => {
    expect(statusOf('tty', 'isatty')).toBe('uncovered');
  });

  it('knows which subtrees contain problems', () => {
    expect(data.hasProblemsBelow({ module: 'fs', path: [] })).toBe(true);
    expect(data.hasProblemsBelow({ module: 'path', path: [] })).toBe(false);
    expect(data.hasProblemsBelow({ module: 'fs', path: ['readFile'] })).toBe(false);
  });
});
