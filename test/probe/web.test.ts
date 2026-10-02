import { webMissingApis } from '@scripts/probe/web.mjs';
import { describe, expect, it } from 'vite-plus/test';

import { findDataDirectory } from '@/data/data-directory.ts';
import { runtimeCompatDataProvider } from '@/data/providers/runtime-compat-data.ts';

const statement = (support: unknown): { __compat: { support: unknown } } => ({
  __compat: { support },
});

const data = {
  api: {
    Gone: statement({ bun: { version_added: false } }),
    Present: statement({ bun: { version_added: '1.0' } }),
    Unknown: statement({ bun: { version_added: null } }),
    Removed: statement({ bun: [{ version_added: '1.0', version_removed: '1.2' }] }),
    Navigator: {
      gpu: statement({ bun: { version_added: false } }),
      online_event: statement({ bun: { version_added: false } }),
    },
    Nullish: statement({ bun: { version_added: null, version_removed: '1.2' } }),
    URL: {
      canParse_static: statement({ bun: { version_added: false } }),
      searchParams: statement({ bun: { version_added: false } }),
      'canParse_static.deeper': statement({ bun: { version_added: false } }),
    },
    OtherRuntime: statement({ deno: { version_added: false } }),
  },
};

describe('webMissingApis', () => {
  it('lists the globals and static members the data marks missing', () => {
    expect(webMissingApis('bun', data)).toEqual([
      '*globals*.Gone',
      '*globals*.Removed',
      '*globals*.URL.canParse',
      '*globals*.navigator.gpu',
    ]);
  });

  it('skips events, unlisted instances and other runtimes', () => {
    expect(webMissingApis('deno', data)).toEqual(['*globals*.OtherRuntime']);
  });
});

describe('webMissingApis against the target data', () => {
  it.each(['workerd', 'bun', 'deno'] as const)(
    'names the same APIs as the provider for %s',
    runtime => {
      const missing = runtimeCompatDataProvider(runtime)
        .load(findDataDirectory())
        .filter(entry => entry.status === 'unsupported')
        .map(entry => [entry.module, ...entry.path].join('.'))
        .sort();
      expect(missing.length).toBeGreaterThan(0);
      expect(webMissingApis(runtime)).toEqual(missing);
    },
  );
});
