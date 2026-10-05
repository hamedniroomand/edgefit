import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const run = (code: string, lazyNodeImports = false): string[] =>
  usagesOf(code, 'lib/index.js', undefined, { lazyNodeImports });

describe('a member of a module that is destructured from a require', () => {
  it('counts where the name is used, not where it is destructured', () => {
    const code =
      "const { Console } = require('node:console');\nfunction make() {\n  return new Console({});\n}\n";
    expect(run(code)).toEqual(['api node:console', 'api node:console.Console']);
  });

  it('counts a name that is used where the file loads at the use', () => {
    expect(run("const { Console } = require('node:console');\nnew Console({});")).toEqual([
      'api node:console',
      'api node:console.Console',
    ]);
  });

  it('counts nothing for a name that is never used, as the read gives undefined', () => {
    expect(run("const { Console } = require('node:console');")).toEqual(['api node:console']);
  });

  it('counts each use of the name', () => {
    const code = "const { Console } = require('node:console');\nnew Console({});\nnew Console({});";
    expect(run(code).filter(usage => usage === 'api node:console.Console')).toHaveLength(2);
  });

  it('counts at the destructuring on a platform that stubs the module, since the read throws', () => {
    expect(run("const { Console } = require('node:console');", true)).toEqual([
      'api node:console.Console',
    ]);
  });

  it('still counts a named import of an ES module at the import', () => {
    expect(run("import { Console } from 'node:console';")).toEqual([
      'api node:console',
      'api node:console.Console',
    ]);
  });

  it('counts a nested name where it is used', () => {
    const code =
      "const { promises: { watch } } = require('node:fs');\nfunction f() {\n  return watch('.');\n}\n";
    expect(run(code)).toEqual(['api node:fs', 'api node:fs.promises.watch']);
  });
});
