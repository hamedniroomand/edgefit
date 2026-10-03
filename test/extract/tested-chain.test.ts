import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const fs = "import fs from 'node:fs';\n";

describe('an operand of an && or || chain that is only tested', () => {
  it.each([
    ['the second operand', 'if (a && fs.watch && b) {}'],
    ['the last operand', 'if (a && b && fs.watch) {}'],
    ['an operand of ||', 'if (a || fs.watch) {}'],
    ['a mixed chain', 'if (a && (b || fs.watch) && c) {}'],
    ['a conditional test', 'const x = a && fs.watch && b ? 1 : 2;'],
    ['a while test', 'while (a && fs.watch && b) {}'],
    ['a negation', 'const x = !(a && fs.watch && b);'],
    ['a wrapped chain', 'if ((a && (fs.watch as any) && b) as boolean) {}'],
  ])('records nothing for %s', (_name, test) => {
    expect(usagesOf(`${fs}${test}`)).toEqual(['api node:fs']);
  });

  it('guards the branch for the member', () => {
    expect(usagesOf(`${fs}if (a && fs.watch && b) {\n  fs.watch('.');\n}`)).toEqual([
      'api node:fs',
      'api node:fs.watch [guarded]',
    ]);
  });

  it('keeps the use when the chain is stored or its value is used', () => {
    expect(usagesOf(`${fs}const x = a && fs.watch && b;`)).toContain('api node:fs.watch');
    expect(usagesOf(`${fs}use(a && fs.watch);`)).toContain('api node:fs.watch');
    expect(usagesOf(`${fs}return_(() => a && fs.watch && b);`)).toContain('api node:fs.watch');
  });

  it('keeps the use when the member is called in the chain', () => {
    expect(usagesOf(`${fs}if (a && fs.watch('.') && b) {}`)).toContain('api node:fs.watch');
  });
});
