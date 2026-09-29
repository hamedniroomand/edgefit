import { describe, expect, it } from 'vite-plus/test';

import { createWorkerdTarget } from '@/targets/workerd/index.ts';
import { checkSettings } from '@/targets/workerd/settings.ts';
import type { WorkerdSettings } from '@/targets/workerd/settings.ts';
import type { WorkerdOptions } from '@/types.ts';
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

describe('what a missing nodejs_compat flag leaves undefined', () => {
  it('marks the result as absent, so a check for the API protects the code', () => {
    const bare = settings('2026-05-20', []);
    expect(checkSettings({ module: 'process', path: ['env'] }, bare)).toMatchObject({
      status: 'unsupported',
      absent: true,
    });
    expect(checkSettings({ module: '*globals*', path: ['Buffer'] }, bare)).toMatchObject({
      absent: true,
    });
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

const notesOf = (root: string, options: WorkerdOptions = {}): readonly string[] =>
  createWorkerdTarget(fixture(root), options).info.notes;

describe('workerd settings that were assumed', () => {
  it('says so when there is no wrangler config', () => {
    expect(notesOf('bun-app')).toEqual([
      'No wrangler config was found, so compatibility_date 2026-09-29 and the flags nodejs_compat are assumed. ' +
        'Set `workerd.compatibilityDate` and `workerd.compatibilityFlags` in the edgefit config, ' +
        'or point `workerd.wranglerConfig` at your wrangler config.',
    ]);
  });

  it('is quiet when the settings came from a wrangler config', () => {
    expect(notesOf('worker')).toEqual([]);
  });

  it('is quiet when the edgefit config sets both', () => {
    const options = { compatibilityDate: '2026-09-29', compatibilityFlags: ['nodejs_compat'] };
    expect(notesOf('bun-app', options)).toEqual([]);
  });
});

describe('workerd settings that are only partly assumed', () => {
  it('names only what is still assumed', () => {
    const [note] = notesOf('bun-app', { compatibilityDate: '2026-09-29' });
    expect(note).toContain('the flags nodejs_compat are assumed');
    expect(note).not.toContain('compatibility_date 2026');
  });

  it('assumes a missing date but not missing flags in a wrangler config', () => {
    const target = createWorkerdTarget(fixture('wrangler-bare'));
    expect(target.info.settings).toContain('flags: none (from wrangler.jsonc)');
    expect(target.info.notes[0]).toContain(
      'wrangler.jsonc has no compatibility_date, so 2026-09-29 is assumed.',
    );
    // From 2026-08-04 nodejs_compat is on without a flag, so the assumed date needs no note.
    expect(target.info.notes.join(' ')).not.toContain('nodejs_compat is not enabled');
  });

  it('says nodejs_compat is off for a wrangler config without flags on an older date', () => {
    const target = createWorkerdTarget(fixture('wrangler-bare'), {
      compatibilityDate: '2026-04-24',
    });
    expect(target.info.settings).toContain('flags: none');
    expect(target.info.notes.join(' ')).toContain('nodejs_compat is not enabled');
  });
});
