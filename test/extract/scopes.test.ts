import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

describe('scope analysis', () => {
  it('does not follow a parameter that shadows an import', () => {
    expect(usagesOf("import path from 'path';\nfunction f(path) { return path.length; }")).toEqual([
      'api node:path',
    ]);
  });

  it('does not follow a block binding that shadows a global', () => {
    expect(usagesOf('{ let process = 1; process.binding; }')).toEqual([]);
  });

  it('follows a hoisted var into its function scope', () => {
    const source = "function f() { if (x) { var fs = require('fs'); } fs.watch('.'); }";
    expect(usagesOf(source, 'lib/index.js')).toContain('api node:fs.watch');
  });

  it('keeps catch parameters and loop variables local', () => {
    const source =
      "import fs from 'fs';\ntry {} catch (fs) { fs.watch; }\nfor (const fs of list) { fs.watch; }";
    expect(usagesOf(source)).toEqual(['api node:fs']);
  });

  it('ignores identifiers in type positions', () => {
    expect(usagesOf('const b: Buffer = input;\ntype P = typeof process;')).toEqual([]);
  });

  it('ignores property keys that share a tracked name', () => {
    expect(
      usagesOf("import fs from 'fs';\nconst o = { fs: 1 };\no.fs;\nclass A { fs() {} }"),
    ).toEqual(['api node:fs']);
  });
});
