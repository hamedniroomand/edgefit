import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const fs = "import fs from 'node:fs';\n";
const guardedWatch = ['api node:fs', 'api node:fs.watch [guarded]'];
const plainWatch = ['api node:fs', 'api node:fs.watch'];

describe('usages inside a try block', () => {
  it('guards what a catch that does not throw again stops', () => {
    expect(usagesOf(`${fs}try {\n  fs.watch('.');\n} catch {}`)).toEqual(guardedWatch);
    expect(usagesOf(`${fs}try {\n  fs.watch('.');\n} catch (error) {\n  log(error);\n}`)).toEqual(
      guardedWatch,
    );
    expect(usagesOf(`${fs}try {\n  fs.watch('.');\n} catch {\n} finally {\n  done();\n}`)).toEqual(
      guardedWatch,
    );
  });

  it('guards a module that is required or awaited inside the block', () => {
    expect(usagesOf("try {\n  require('node:sqlite');\n} catch {}")).toEqual([
      'api node:sqlite [guarded]',
    ]);
    expect(usagesOf("try {\n  await import('node:sqlite');\n} catch {}")).toEqual([
      'api node:sqlite [guarded]',
    ]);
  });
});

describe('usages a try block does not guard', () => {
  it('does not guard a catch that throws again', () => {
    expect(usagesOf(`${fs}try {\n  fs.watch('.');\n} catch (error) {\n  throw error;\n}`)).toEqual(
      plainWatch,
    );
    expect(
      usagesOf(
        `${fs}try {\n  fs.watch('.');\n} catch (error) {\n  if (error.code !== 'ENOENT') throw error;\n}`,
      ),
    ).toEqual(plainWatch);
  });

  it('does not guard a try without a catch', () => {
    expect(usagesOf(`${fs}try {\n  fs.watch('.');\n} finally {\n  done();\n}`)).toEqual(plainWatch);
  });

  it('does not guard the catch and finally blocks themselves', () => {
    expect(usagesOf(`${fs}try {\n  run();\n} catch {\n  fs.watch('.');\n}`)).toEqual(plainWatch);
    expect(usagesOf(`${fs}try {\n  run();\n} catch {} finally {\n  fs.watch('.');\n}`)).toEqual(
      plainWatch,
    );
  });

  it('does not guard code that runs after the block ends', () => {
    expect(usagesOf(`${fs}try {\n  later(() => fs.watch('.'));\n} catch {}`)).toEqual(plainWatch);
    expect(usagesOf(`${fs}try {\n  class A { field = fs.watch('.'); }\n} catch {}`)).toEqual(
      plainWatch,
    );
    // A promise nothing awaits rejects outside the block.
    expect(usagesOf("try {\n  import('node:sqlite').then(use);\n} catch {}")).toEqual([
      'api node:sqlite.then',
    ]);
  });

  it('still counts a catch that only defines a function that throws', () => {
    expect(
      usagesOf(
        `${fs}try {\n  fs.watch('.');\n} catch {\n  fail = () => {\n    throw new Error();\n  };\n}`,
      ),
    ).toEqual(guardedWatch);
  });
});

describe('usages behind a helper that holds a check', () => {
  it('follows a function that returns the check', () => {
    expect(
      usagesOf(
        `${fs}function hasWatch() {\n  return typeof fs.watch === 'function';\n}\nif (hasWatch()) fs.watch('.');`,
      ),
    ).toEqual(guardedWatch);
    expect(
      usagesOf(`${fs}const hasWatch = () => !!fs.watch;\nif (hasWatch()) fs.watch('.');`),
    ).toEqual(guardedWatch);
    expect(
      usagesOf(
        `${fs}const hasWatch = function () {\n  return 'watch' in fs;\n};\nhasWatch() && fs.watch('.');`,
      ),
    ).toEqual(guardedWatch);
  });
});

describe('usages behind a helper: where it is declared', () => {
  it('follows a helper that is declared below its use', () => {
    expect(
      usagesOf(
        `${fs}export function run() {\n  if (hasWatch()) fs.watch('.');\n}\nfunction hasWatch() {\n  return !!fs.watch;\n}`,
      ),
    ).toEqual(guardedWatch);
  });

  it('follows a constant that holds the check', () => {
    expect(
      usagesOf(
        `${fs}const hasWatch = typeof fs.watch === 'function';\nif (hasWatch) fs.watch('.');`,
      ),
    ).toEqual(guardedWatch);
    expect(
      usagesOf(`${fs}const isDeno = typeof Deno !== 'undefined';\nif (isDeno) fs.watch('.');`),
    ).toEqual(['api node:fs', 'api node:fs.watch [deno]']);
  });

  it('follows negation, helpers of helpers and a helper that checks the runtime', () => {
    const source = `${fs}const isDeno = () => typeof Deno !== 'undefined';\nconst isBun = () => !!process.versions.bun;\nconst isOther = () => !isDeno() && !isBun();\nif (isOther()) fs.watch('.');`;
    expect(usagesOf(source)).toEqual(['api node:fs', 'api node:fs.watch [not deno] [not bun]']);
    expect(
      usagesOf(
        `${fs}const isDeno = () => typeof Deno !== 'undefined';\nif (!isDeno()) fs.watch('.');`,
      ),
    ).toEqual(['api node:fs', 'api node:fs.watch [not deno]']);
  });

  it('follows a helper declared in the enclosing function', () => {
    expect(
      usagesOf(
        `${fs}function run() {\n  const has = () => !!fs.watch;\n  if (has()) fs.watch('.');\n}`,
      ),
    ).toEqual(guardedWatch);
  });
});

describe('usages behind a var or let that holds the check', () => {
  it('follows when the name is not written again', () => {
    expect(
      usagesOf(`${fs}var hasWatch = typeof fs.watch === 'function';\nif (hasWatch) fs.watch('.');`),
    ).toEqual(guardedWatch);
    expect(
      usagesOf(
        `${fs}let hasWatch = typeof fs.watch !== 'undefined';\nif (hasWatch) fs.watch('.');`,
      ),
    ).toEqual(guardedWatch);
    expect(
      usagesOf(
        "var reading = typeof FileReader !== 'undefined';\nfunction read() { if (reading) new FileReader(); }",
        'src/input.ts',
        new Set(['FileReader']),
      ),
    ).toEqual(['api FileReader [guarded]']);
  });

  it('follows when a nested function declares the same name again', () => {
    expect(
      usagesOf(
        "var n = typeof FileReader !== 'undefined';\nfunction a(n) { n = 1; }\nfunction b() { var n = 2; }\nif (n) new FileReader();",
        'src/input.ts',
        new Set(['FileReader']),
      ),
    ).toEqual(['api FileReader [guarded]']);
  });

  it.each([
    ['an assignment', 'hasWatch = false;'],
    ['an assignment in a function', 'function off() { hasWatch = false; }'],
    ['a declaration in a block', 'if (flag) { var hasWatch = true; }'],
    ['a loop target', 'for (hasWatch of flags) {}'],
    ['an update', 'hasWatch++;'],
  ])('does not follow when %s writes the name again', (_, write) => {
    expect(
      usagesOf(
        `${fs}var hasWatch = typeof fs.watch === 'function';\n${write}\nif (hasWatch) fs.watch('.');`,
      ),
    ).toEqual(plainWatch);
  });
});

describe('usages behind a value that only a module sets', () => {
  it('guards the domain module where process.domain is set', () => {
    expect(usagesOf("if (process.domain) require('domain');")).toContain(
      'api node:domain [guarded]',
    );
    expect(
      usagesOf(
        "var domain;\nvar parent = process.domain;\nif (parent) { domain = require('domain'); }",
      ),
    ).toContain('api node:domain [guarded]');
  });

  it.each([
    ['no check', "require('domain');"],
    ['a typeof check', "if (typeof process.domain !== 'undefined') require('domain');"],
    ['an in check', "if ('domain' in process) require('domain');"],
    ['a null check', "if (process.domain != null) require('domain');"],
    ['a falsy read', "if (!process.domain) require('domain');"],
  ])('does not guard the domain module behind %s', (_, source) => {
    expect(usagesOf(source)).toContain('api node:domain');
  });
});

describe('usages behind something that is not a helper', () => {
  it('does not follow a helper that does more than return a check', () => {
    expect(
      usagesOf(`${fs}function has(x) {\n  return !!fs.watch;\n}\nif (has(1)) fs.watch('.');`),
    ).toEqual(plainWatch);
    expect(
      usagesOf(
        `${fs}function has() {\n  log();\n  return !!fs.watch;\n}\nif (has()) fs.watch('.');`,
      ),
    ).toEqual(plainWatch);
    // A promise is always truthy.
    expect(usagesOf(`${fs}const has = async () => !!fs.watch;\nif (has()) fs.watch('.');`)).toEqual(
      plainWatch,
    );
  });

  it('does not treat a function as a constant, or a constant as a function', () => {
    expect(usagesOf(`${fs}const has = () => !!fs.watch;\nif (has) fs.watch('.');`)).toEqual(
      plainWatch,
    );
    expect(usagesOf(`${fs}const has = !!fs.watch;\nif (has()) fs.watch('.');`)).toEqual(plainWatch);
  });

  it('does not follow a name that a nearer declaration replaces', () => {
    expect(
      usagesOf(
        `${fs}const has = () => !!fs.watch;\nfunction run(has) {\n  if (has()) fs.watch('.');\n}`,
      ),
    ).toEqual(plainWatch);
  });

  it('stops at a helper that calls itself', () => {
    expect(usagesOf(`${fs}const loop = () => loop();\nif (loop()) fs.watch('.');`)).toEqual(
      plainWatch,
    );
  });
});
