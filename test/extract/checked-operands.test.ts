import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const imported = "import fs from 'node:fs';\n";

describe('an operand of `||` or `??`', () => {
  it.each(['||', '??'])('is a check when both sides are APIs, with `%s`', op => {
    expect(usagesOf(`${imported}export const f = fs.watch ${op} fs.watchFile;`)).toEqual([
      'api node:fs',
      'api node:fs.watch [guarded]',
      'api node:fs.watchFile [guarded]',
    ]);
  });

  it('is a use when the value is called in place', () => {
    expect(usagesOf(`${imported}export const f = (fs.watch || fs.watchFile)();`)).toEqual([
      'api node:fs',
      'api node:fs.watch',
      'api node:fs.watchFile',
    ]);
  });

  it('is a use on the right when the left side is not an API', () => {
    expect(usagesOf(`${imported}export const f = o => o.x || fs.watch;`)).toEqual([
      'api node:fs',
      'api node:fs.watch',
    ]);
  });
});
