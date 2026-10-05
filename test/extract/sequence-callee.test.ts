import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const fs = "const ns = require('node:fs');\n";
const assert = "const a = __importDefault(require('node:assert'));\n";
const lib = (source: string): string[] => usagesOf(source, 'lib/index.js');

describe('a call through a sequence expression', () => {
  it('counts the member of `(0, ns.member)()`', () => {
    expect(lib(`${fs}(0, ns.readFile)('a');`)).toEqual(['api node:fs', 'api node:fs.readFile']);
  });

  it('counts the member when parentheses wrap the sequence', () => {
    expect(lib(`${fs}((0, ns.readFile))('a');`)).toEqual(['api node:fs', 'api node:fs.readFile']);
  });

  it('counts the member when a call comes first in the sequence', () => {
    expect(lib(`${fs}(f(), ns.readFile)('a');`)).toEqual(['api node:fs', 'api node:fs.readFile']);
  });

  it('counts the member of `new (0, ns.member)()`', () => {
    expect(lib(`${fs}new (0, ns.Stats)();`)).toEqual(['api node:fs', 'api node:fs.Stats']);
  });

  it('counts the module for `(0, ns.default)()` through __importDefault', () => {
    expect(lib(`${assert}(0, a.default)(1);`)).toEqual(['api node:assert', 'api node:assert']);
  });

  it('still reports a sequence value that is passed on', () => {
    expect(lib(`${fs}use((0, ns.readFile));`)).toContain('dynamic node:fs.readFile');
  });
});

describe('the __toModule helper of esbuild before 0.14', () => {
  const util = "var import_util = __toModule(require('util'));\n";

  it('counts the module and the members that the code reads from it', () => {
    expect(lib(`${util}import_util.inspect({});`)).toEqual([
      'api node:util',
      'api node:util.inspect',
    ]);
    expect(lib(`${util}import_util.default.inspect({});`)).toEqual([
      'api node:util',
      'api node:util.inspect',
    ]);
  });

  it('leaves a call of a helper that is not known as unknown', () => {
    expect(lib("var import_util = __toSomething(require('util'));")).toEqual([
      'api node:util',
      'dynamic node:util',
    ]);
  });
});
