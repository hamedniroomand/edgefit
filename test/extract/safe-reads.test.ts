import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

describe('a read of a global through the global object', () => {
  it('checks its own API when the code only compares or keeps the value', () => {
    expect(usagesOf('const a = globalThis.Foo;\nBoolean(self.Bar);\nglobal.Baz === x;')).toEqual([
      'api Foo [guarded]',
      'api Bar [guarded]',
      'api Baz [guarded]',
    ]);
  });

  it('records nothing for a test of a loop, as for the test of an `if`', () => {
    expect(
      usagesOf(
        'while (globalThis.Qux) break;\ndo {} while (self.Qux);\nfor (; global.Qux; ) break;\nif (globalThis.Qux) h();',
      ),
    ).toEqual([]);
  });

  it('does not check any other use', () => {
    expect(
      usagesOf(
        'globalThis.Foo();\nnew globalThis.Bar();\nglobalThis.Tag`x`;\nglobalThis.Baz.y;\nrun(self.Qux);\nlet b = global.Zip;\nexport const c = globalThis.Zap;\nconst Boolean = f;\nBoolean(globalThis.Zoo);',
      ),
    ).toEqual([
      'api Foo',
      'api Bar',
      'api Tag',
      'api Baz.y',
      'api Qux',
      'api Zip',
      'api Zap',
      'api Zoo',
    ]);
  });
});
