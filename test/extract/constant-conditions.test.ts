import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const fs = "import fs from 'node:fs';\n";

const runs = (source: string): boolean => usagesOf(`${fs}${source}`).includes('api node:fs.watch');

describe('usages behind a condition made only of literals', () => {
  it.each([
    ['"edge" === "nodejs"'],
    ['"edge" !== "edge"'],
    ['!1'],
    ['0'],
    ['""'],
    ['null'],
    ['void 0'],
    ['void 0 === 1'],
    ['void 0 !== void 0'],
    ['typeof "x" === "number"'],
    ['typeof void 0 !== "undefined"'],
    ['typeof null === "undefined"'],
    ['!0 && !1'],
    ['0 || null'],
    ['null ?? 0'],
    ['-0'],
  ])('skips the branch of `if (%s)`', test => {
    expect(runs(`if (${test}) fs.watch('.');`)).toBe(false);
  });

  it.each([
    ['"edge" === "edge"'],
    ['"edge" !== "nodejs"'],
    ['!0'],
    ['1'],
    ['"x"'],
    ['typeof "x" === "string"'],
    ['void 0 === void 0'],
    ['null == void 0'],
    ['0 || 1'],
    ['null ?? 1'],
    ['1 && !0'],
  ])('keeps the branch of `if (%s)`', test => {
    expect(runs(`if (${test}) fs.watch('.');`)).toBe(true);
  });
});

describe('constant conditions in other forms', () => {
  it('follows the else branch, a ternary, && and ||', () => {
    expect(runs("if ('edge' === 'edge') noop(); else fs.watch('.');")).toBe(false);
    expect(runs("'edge' === 'nodejs' ? fs.watch('.') : noop();")).toBe(false);
    expect(runs("'edge' === 'nodejs' && fs.watch('.');")).toBe(false);
    expect(runs("'edge' === 'edge' || fs.watch('.');")).toBe(false);
    expect(runs("'edge' === 'nodejs' ? noop() : fs.watch('.');")).toBe(true);
  });

  it('skips code after a guard clause that always leaves', () => {
    expect(runs("function run() {\n  if (!0) return;\n  fs.watch('.');\n}")).toBe(false);
  });

  it('keeps the branch when part of the condition is not a literal', () => {
    expect(runs("if (flag() && 'edge' === 'edge') fs.watch('.');")).toBe(true);
    expect(runs("if ('edge' === mode) fs.watch('.');")).toBe(true);
  });

  it('does not decide a comparison that needs type coercion', () => {
    expect(runs("if (1 == '1') fs.watch('.');")).toBe(true);
    expect(runs("if (0 == '') fs.watch('.');")).toBe(true);
  });

  it('does not take a regular expression or a bigint for a value', () => {
    expect(runs("if (/x/) fs.watch('.');")).toBe(true);
    expect(runs("if (0n) fs.watch('.');")).toBe(true);
    expect(runs("if (+0) fs.watch('.');")).toBe(true);
  });
});
