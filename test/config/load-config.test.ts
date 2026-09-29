import { describe, expect, it } from 'vite-plus/test';

import { loadConfig } from '@/config/load-config.ts';
import { validateConfig } from '@/config/validate-config.ts';
import { fixture } from '~/helpers.ts';

describe('loading config files', () => {
  it('loads a TypeScript config that imports local modules', async () => {
    const { file, config } = await loadConfig(fixture('configured'));
    expect(file).toMatch(/edgefit\.config\.ts$/u);
    expect(config.entry).toBe('src/index.ts');
    expect(config.levels).toEqual({ mismatch: 'error' });
  });

  it('returns an empty config when there is no config file', async () => {
    expect(await loadConfig(fixture('worker'))).toEqual({ file: undefined, config: {} });
  });

  it('rejects unknown targets', async () => {
    await expect(loadConfig(fixture('invalid-config'))).rejects.toThrow('unknown target netlify');
  });

  it('rejects a missing explicit config file', async () => {
    await expect(loadConfig(fixture('worker'), 'missing.config.ts')).rejects.toThrow('not found');
  });
});

describe('validating config values', () => {
  it('rejects invalid levels', () => {
    expect(() => validateConfig({ levels: { unknown: 'loud' } }, 'edgefit.config.ts')).toThrow(
      '`levels.unknown` must be error, warning or off',
    );
  });

  it('rejects an invalid deno config file option', () => {
    expect(() => validateConfig({ deno: { configFile: true } }, 'edgefit.config.ts')).toThrow(
      '`deno.configFile` must be a string or false',
    );
  });

  it('rejects ignore rules without a package or api', () => {
    expect(() => validateConfig({ ignore: [{ reason: 'x' }] }, 'edgefit.config.ts')).toThrow(
      'needs a `package`, an `api`, or both',
    );
  });
});

describe('validating config shape', () => {
  const invalid: [string, unknown, string][] = [
    ['a non-object config', [], 'the default export must be an object'],
    ['empty targets', { targets: [] }, '`targets` must be a non-empty array'],
    ['a non-string entry', { entry: 1 }, '`entry` must be a string'],
    ['non-string conditions', { conditions: [1] }, '`conditions` must be an array of strings'],
    ['unknown level categories', { levels: { loud: 'off' } }, 'unknown category `loud`'],
    ['non-array ignore', { ignore: {} }, '`ignore` must be an array'],
    ['a non-object workerd option', { workerd: 'x' }, '`workerd` must be an object'],
    ['a non-string bun version', { bun: { version: 1 } }, '`bun.version` must be a string'],
  ];

  it.each(invalid)('rejects %s', (_name, config, message) => {
    expect(() => validateConfig(config, 'edgefit.config.ts')).toThrow(message);
  });

  it('accepts a complete valid config', () => {
    const config = {
      targets: ['workerd', 'bun'],
      entry: 'src/index.ts',
      conditions: ['custom'],
      levels: { unknown: 'off' },
      ignore: [{ package: 'chokidar', reason: 'dev only' }],
      workerd: { compatibilityDate: '2025-01-01' },
      bun: { version: '1.3.0' },
      deno: { configFile: false },
    };
    expect(validateConfig(config, 'edgefit.config.ts')).toBe(config);
  });
});
