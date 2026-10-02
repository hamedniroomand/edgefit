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

describe('suggesting nodejs_compat', () => {
  const buffer = { module: '*globals*', path: ['Buffer'] };

  it('says to add the flag when it is missing', () => {
    const result = checkSettings(buffer, settings('2026-04-24', []));
    expect(result?.suggestion).toMatchObject({
      setting: { name: 'compatibility_flags', value: 'nodejs_compat' },
    });
  });

  it('says to remove no_nodejs_compat when that is all that turns it off', () => {
    const result = checkSettings(buffer, settings('2026-09-01', ['no_nodejs_compat']));
    expect(result?.suggestion?.setting).toEqual({
      name: 'compatibility_flags',
      value: 'no_nodejs_compat',
      remove: true,
    });
  });

  it('says to replace no_nodejs_compat before the date it is on by default', () => {
    const result = checkSettings(buffer, settings('2026-04-24', ['no_nodejs_compat']));
    expect(result?.suggestion?.text).toContain('Replace `no_nodejs_compat`');
    expect(result?.suggestion?.setting).toEqual({
      name: 'compatibility_flags',
      value: 'nodejs_compat',
    });
  });
});

describe('workerd module gates', () => {
  it('reports modules as mocked before their compatibility date', () => {
    const result = checkSettings({ module: 'fs', path: ['readFileSync'] }, settings('2025-09-14'));
    expect(result?.status).toBe('mocked');
    expect(result?.suggestion?.setting).toEqual({
      name: 'compatibility_date',
      value: '2025-09-15',
    });
  });

  it('says to remove a disable flag that closes a gate the date would open', () => {
    const closed = settings('2026-09-01', ['nodejs_compat', 'disable_nodejs_fs_module']);
    const result = checkSettings({ module: 'fs', path: ['readFileSync'] }, closed);
    expect(result?.status).toBe('mocked');
    expect(result?.suggestion?.setting).toEqual({
      name: 'compatibility_flags',
      value: 'disable_nodejs_fs_module',
      remove: true,
    });
  });

  it('says to replace a disable flag when the date is too early to open the gate', () => {
    const closed = settings('2025-09-14', ['nodejs_compat', 'disable_nodejs_fs_module']);
    const result = checkSettings({ module: 'fs', path: ['readFileSync'] }, closed);
    expect(result?.suggestion?.text).toContain('Replace `disable_nodejs_fs_module`');
    expect(result?.suggestion?.setting).toEqual({
      name: 'compatibility_flags',
      value: 'enable_nodejs_fs_module',
    });
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

describe('workerd constants that unenv provides', () => {
  const early = settings('2025-04-01');
  const status = (module: string, path: string[]): string | undefined =>
    checkSettings({ module, path }, early)?.status;

  it('does not report a constant value of the polyfill', () => {
    expect(checkSettings({ module: 'os', path: ['EOL'] }, early)).toBeUndefined();
    expect(checkSettings({ module: 'os', path: ['constants'] }, early)).toBeUndefined();
  });

  it('still reports functions, classes and objects of stubs', () => {
    expect(status('os', ['cpus'])).toBe('mocked');
    expect(status('os', ['setPriority'])).toBe('mocked');
    expect(status('fs', ['readFile'])).toBe('mocked');
    expect(status('fs', ['existsSync'])).toBe('mocked');
    expect(status('fs', ['promises'])).toBe('mocked');
    expect(status('http', ['Server'])).toBe('mocked');
    expect(status('child_process', ['ChildProcess'])).toBe('mocked');
  });

  it('still reports what is not known: a module, a member, a nested member', () => {
    expect(status('os', ['unknown'])).toBe('mocked');
    expect(status('os', [])).toBe('mocked');
    expect(status('os', ['constants', 'signals'])).toBe('mocked');
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
    expect(target.entries.exact?.files).toEqual(['src/index.ts']);
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

describe('workerd Web APIs', () => {
  const target = createWorkerdTarget(fixture('worker'));

  it('reports URL.createObjectURL as a stub that throws', () => {
    expect(target.lookup({ module: '*globals*', path: ['URL', 'createObjectURL'] })).toEqual({
      status: 'unsupported',
      note: 'exists, but throws: not implemented',
      source:
        'https://github.com/cloudflare/workerd/tree/v1.20260929.1/src/workerd/api/url-standard.c++',
    });
  });

  it('supports a Web API that the data marks missing but workerd has', () => {
    expect(target.lookup({ module: '*globals*', path: ['reportError'] }).status).toBe('supported');
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
    expect(createWorkerdTarget(fixture('nitro-redirect')).entries.exact?.files).toEqual([
      '.output/server/index.mjs',
    ]);
  });

  it('resolves main of an explicit config against that config', () => {
    const target = createWorkerdTarget(fixture('nitro-redirect'), {
      wranglerConfig: '.output/server/wrangler.json',
    });
    expect(target.entries.exact?.files).toEqual(['.output/server/index.mjs']);
  });

  it('is skipped when the wrangler config is turned off', () => {
    const target = createWorkerdTarget(fixture('nitro-redirect'), { wranglerConfig: false });
    expect(target.entries.exact).toBeUndefined();
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
