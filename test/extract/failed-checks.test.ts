import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const fs = "import fs from 'node:fs';\n";
const node =
  "typeof process == 'object' && typeof process.versions == 'object' && typeof process.versions.node == 'string'";
const watch = (code: string): string[] =>
  usagesOf(`${fs}${code}`).filter(usage => usage.startsWith('api node:fs.watch'));

describe('a failed chain of checks', () => {
  it('keeps the facts of every operand of a false && for the else branch', () => {
    expect(watch(`if (${node}) noop(); else fs.watch('.');`)).toEqual([
      'api node:fs.watch [unless node:process, global process, node:process.versions, node:process.versions.node]',
    ]);
  });

  it('reads a true || as a false && of the negated operands', () => {
    expect(
      watch(`if (typeof Deno === 'undefined' || typeof Bun === 'undefined') fs.watch('.');`),
    ).toEqual(['api node:fs.watch [unless deno, bun]']);
  });

  it('applies through a negation, a held check, a guard clause and a value', () => {
    const tag = 'api node:fs.watch [unless deno, bun]';
    expect(
      watch(`if (!(typeof Deno !== 'undefined' && typeof Bun !== 'undefined')) fs.watch('.');`),
    ).toEqual([tag]);
    expect(
      watch(
        `const both = typeof Deno !== 'undefined' && typeof Bun !== 'undefined';\nif (!both) fs.watch('.');`,
      ),
    ).toEqual([tag]);
    expect(
      watch(
        `function f() {\n  if (typeof Deno !== 'undefined' && typeof Bun !== 'undefined') return;\n  fs.watch('.');\n}`,
      ),
    ).toEqual([tag]);
    expect(
      watch(`(typeof Deno !== 'undefined' && typeof Bun !== 'undefined') || fs.watch('.');`),
    ).toEqual([tag]);
  });

  it('tells nothing when an operand has no fact that the data decides', () => {
    expect(watch(`if (typeof process == 'object' && !h()) noop(); else fs.watch('.');`)).toEqual([
      'api node:fs.watch',
    ]);
    expect(
      watch(`if (typeof Deno !== 'undefined' && options.x) noop(); else fs.watch('.');`),
    ).toEqual(['api node:fs.watch']);
  });

  it('does not change the branch where the chain holds', () => {
    expect(watch(`if (typeof Deno !== 'undefined' && Deno.core) fs.watch('.');`)).toEqual([
      'api node:fs.watch [deno]',
    ]);
  });
});
