import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const fs = "import fs from 'node:fs';\n";
const plainWatch = ['api node:fs', 'api node:fs.watch'];

const guardedWatch = ['api node:fs', 'api node:fs.watch [guarded]'];

describe('an operand of || and ??', () => {
  it('records a guarded use for a value that is stored', () => {
    expect(usagesOf(`${fs}const f = fs.watch ?? fs.watchFile;`)).toEqual([
      'api node:fs',
      'api node:fs.watch [guarded]',
      'api node:fs.watchFile [guarded]',
    ]);
    expect(usagesOf(`${fs}const f = fs.watch || fallback;`)).toEqual(guardedWatch);
    expect(usagesOf(`${fs}const f = fs.watch || fs.watchFile || fallback;`)).toEqual([
      'api node:fs',
      'api node:fs.watch [guarded]',
      'api node:fs.watchFile [guarded]',
    ]);
  });

  it('records a guarded use through a wrapper', () => {
    expect(usagesOf(`${fs}const f = (fs.watch as any) || fallback;`)).toEqual(guardedWatch);
  });

  it('records the right operand as a plain use when the left one is not an API', () => {
    expect(usagesOf(`${fs}const f = fallback || fs.watch;`)).toEqual(plainWatch);
  });

  it('records the use when the value is called in place', () => {
    expect(usagesOf(`${fs}(fs.watch || fallback)('.');`)).toEqual(plainWatch);
    expect(usagesOf(`${fs}(fs.watch ?? fallback)('.');`)).toEqual(plainWatch);
    expect(usagesOf(`${fs}((fs.watch || fallback) as any)('.');`)).toEqual(plainWatch);
  });

  it('records the use of an operand of other operators', () => {
    expect(usagesOf(`${fs}const f = fs.watch && fallback;`)).toEqual(['api node:fs']);
    expect(usagesOf(`${fs}const f = [fs.watch];`)).toContain('api node:fs.watch');
  });
});
