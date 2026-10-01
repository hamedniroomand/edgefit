import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const fs = "import fs from 'node:fs';\n";

// The condition reads `process.env.NODE_ENV`, so only the call under it says whether the branch ran.
const runs = (source: string, nodeEnv?: string): boolean =>
  usagesOf(`${fs}${source}`, undefined, undefined, { nodeEnv }).includes('api node:fs.watch');

describe('usages behind a check of process.env.NODE_ENV', () => {
  it('skips the branch a production build removes', () => {
    expect(runs("if (process.env.NODE_ENV !== 'production') fs.watch('.');")).toBe(false);
    expect(runs("if (process.env.NODE_ENV === 'development') fs.watch('.');")).toBe(false);
    expect(runs("if ('production' !== process.env.NODE_ENV) fs.watch('.');")).toBe(false);
    expect(runs("if (process['env']['NODE_ENV'] !== 'production') fs.watch('.');")).toBe(false);
  });

  it('keeps the branch a production build runs', () => {
    expect(runs("if (process.env.NODE_ENV === 'production') fs.watch('.');")).toBe(true);
    expect(runs("if (process.env.NODE_ENV !== 'development') fs.watch('.');")).toBe(true);
  });

  it('follows the else branch, a ternary, and && and ||', () => {
    expect(runs("if (process.env.NODE_ENV === 'production') noop(); else fs.watch('.');")).toBe(
      false,
    );
    expect(runs("process.env.NODE_ENV !== 'production' ? fs.watch('.') : noop();")).toBe(false);
    expect(runs("process.env.NODE_ENV !== 'production' && fs.watch('.');")).toBe(false);
    expect(runs("process.env.NODE_ENV === 'production' || fs.watch('.');")).toBe(false);
  });

  it('follows a guard clause, a const and a helper that hold the check', () => {
    expect(
      runs(
        "function run() {\n  if (process.env.NODE_ENV === 'production') return;\n  fs.watch('.');\n}",
      ),
    ).toBe(false);
    expect(
      runs("const isDev = process.env.NODE_ENV !== 'production';\nif (isDev) fs.watch('.');"),
    ).toBe(false);
    expect(
      runs(
        "const isDev = () => process.env.NODE_ENV !== 'production';\nif (isDev()) fs.watch('.');",
      ),
    ).toBe(false);
  });
});

describe('usages behind a check of process.env.NODE_ENV, with a setting or no answer', () => {
  it('uses the NODE_ENV the config sets', () => {
    expect(runs("if (process.env.NODE_ENV !== 'production') fs.watch('.');", 'development')).toBe(
      true,
    );
    expect(runs("if (process.env.NODE_ENV === 'production') fs.watch('.');", 'development')).toBe(
      false,
    );
  });

  it('keeps what it cannot decide', () => {
    expect(runs("if (process.env.NODE_ENV !== mode) fs.watch('.');")).toBe(true);
    expect(runs("if (process.env.OTHER !== 'production') fs.watch('.');")).toBe(true);
    expect(
      runs(
        "const process = { env: {} };\nif (process.env.NODE_ENV !== 'production') fs.watch('.');",
      ),
    ).toBe(true);
  });

  it('skips an access edgefit cannot follow in the removed branch', () => {
    const source = "if (process.env.NODE_ENV !== 'production') require(name);";
    expect(usagesOf(source).some(usage => usage.startsWith('dynamic'))).toBe(false);
    expect(
      usagesOf(source, undefined, undefined, { nodeEnv: 'development' }).some(usage =>
        usage.startsWith('dynamic'),
      ),
    ).toBe(true);
  });
});
