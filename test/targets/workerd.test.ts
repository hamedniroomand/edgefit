import { describe, expect, it } from 'vite-plus/test';

import { createWorkerdTarget } from '@/targets/workerd/index.ts';
import { checkSettings } from '@/targets/workerd/settings.ts';
import type { WorkerdSettings } from '@/targets/workerd/settings.ts';
import { fixture } from '~/helpers.ts';

function settings(
  compatibilityDate: string,
  compatibilityFlags = ['nodejs_compat'],
): WorkerdSettings {
  return { compatibilityDate, compatibilityFlags, origin: 'test' };
}

describe('nodejs_compat setting', () => {
  it('reports every built-in as unsupported without nodejs_compat', () => {
    const result = checkSettings({ module: 'path', path: ['join'] }, settings('2026-04-24', []));
    expect(result?.status).toBe('unsupported');
  });

  it('treats nodejs_compat as on by default from 2026-08-04', () => {
    const api = { module: 'path', path: ['join'] };
    expect(checkSettings(api, settings('2026-08-04', []))).toBeUndefined();
    expect(checkSettings(api, settings('2026-08-03', []))?.status).toBe('unsupported');
  });

  it('lets no_nodejs_compat turn off the default', () => {
    const result = checkSettings(
      { module: 'path', path: ['join'] },
      settings('2026-09-01', ['no_nodejs_compat']),
    );
    expect(result?.status).toBe('unsupported');
  });

  it('allows async_hooks with nodejs_als alone', () => {
    const result = checkSettings(
      { module: 'async_hooks', path: [] },
      settings('2026-04-24', ['nodejs_als']),
    );
    expect(result).toBeUndefined();
  });
});

describe('workerd module gates', () => {
  it('reports modules as mocked before their compatibility date', () => {
    const result = checkSettings({ module: 'fs', path: ['readFileSync'] }, settings('2025-09-14'));
    expect(result?.status).toBe('mocked');
    expect(result?.note).toContain('2025-09-15');
  });

  it('accepts modules on or after their compatibility date', () => {
    expect(
      checkSettings({ module: 'fs', path: ['readFileSync'] }, settings('2025-09-15')),
    ).toBeUndefined();
  });

  it('accepts an explicit enable flag regardless of date', () => {
    const flags = ['nodejs_compat', 'enable_nodejs_fs_module'];
    expect(
      checkSettings({ module: 'fs', path: [] }, settings('2025-01-01', flags)),
    ).toBeUndefined();
  });

  it('gates http server APIs separately from the http client', () => {
    const date = settings('2025-08-20');
    expect(checkSettings({ module: 'http', path: ['request'] }, date)).toBeUndefined();
    expect(checkSettings({ module: 'http', path: ['createServer'] }, date)?.status).toBe('mocked');
  });
});

describe('workerd target', () => {
  it('reads settings and the entry from the wrangler config', () => {
    const target = createWorkerdTarget(fixture('worker'));
    expect(target.defaultEntry).toBe('src/index.ts');
    expect(target.info.settings).toContain('from wrangler.jsonc');
  });

  it('lets explicit options override the wrangler config', () => {
    const target = createWorkerdTarget(fixture('worker'), { compatibilityDate: '2025-01-01' });
    expect(target.info.settings).toContain('compatibility_date 2025-01-01');
    expect(target.lookup({ module: 'fs', path: ['readFileSync'] }).status).toBe('mocked');
  });

  it('falls back to the data defaults without a wrangler config', () => {
    const target = createWorkerdTarget(fixture('worker'), { wranglerConfig: false });
    expect(target.info.settings).toContain('compatibility data defaults');
  });
});

describe('workerd target with a deploy redirect', () => {
  it('follows .wrangler/deploy/config.json to the generated config', () => {
    const target = createWorkerdTarget(fixture('nitro-redirect'));
    expect(target.info.settings).toBe(
      'compatibility_date 2026-09-01, flags: nodejs_compat (from .output/server/wrangler.json)',
    );
  });

  it('resolves main against the config it was written in', () => {
    expect(createWorkerdTarget(fixture('nitro-redirect')).defaultEntry).toBe(
      '.output/server/index.mjs',
    );
  });

  it('resolves main of an explicit config against that config', () => {
    const target = createWorkerdTarget(fixture('nitro-redirect'), {
      wranglerConfig: '.output/server/wrangler.json',
    });
    expect(target.defaultEntry).toBe('.output/server/index.mjs');
  });

  it('is skipped when the wrangler config is turned off', () => {
    const target = createWorkerdTarget(fixture('nitro-redirect'), { wranglerConfig: false });
    expect(target.defaultEntry).toBeUndefined();
  });
});
