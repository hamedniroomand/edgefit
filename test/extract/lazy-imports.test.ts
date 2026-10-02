import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const lazy = (source: string): string[] =>
  usagesOf(source, 'src/input.ts', undefined, { lazyNodeImports: true });

describe('usages when the platform stubs out a Node.js module it lacks', () => {
  it('does not count an import, or a require, that nothing reads from', () => {
    expect(lazy("import fs from 'node:fs';")).toEqual([]);
    expect(lazy("import * as fs from 'node:fs';")).toEqual([]);
    expect(lazy("import 'node:fs';")).toEqual([]);
    expect(lazy("import { watch } from 'node:fs';")).toEqual([]);
    expect(lazy("const fs = require('node:fs');")).toEqual([]);
  });

  it('counts what is read from the module, where it is read', () => {
    expect(lazy("import fs from 'node:fs';\nfs.watch('.');")).toEqual(['api node:fs.watch']);
    expect(lazy("import { watch } from 'node:fs';\nwatch('.');")).toEqual(['api node:fs.watch']);
    expect(lazy("import { watch as w } from 'fs';\nw('.');")).toEqual(['api node:fs.watch']);
  });

  it('counts a property read when the module is destructured, since that throws at once', () => {
    expect(lazy("const { watch } = require('node:fs');")).toEqual(['api node:fs.watch']);
  });

  it('applies a runtime check around a use of a named import', () => {
    const code =
      "import { watch } from 'node:fs';\nif (process.env.NEXT_RUNTIME === 'nodejs') watch('.');";
    expect(lazy(code).filter(usage => usage.startsWith('api node:fs.watch'))).toEqual([
      'api node:fs.watch [not vercel-edge]',
    ]);
  });

  it('still counts a global, which is not a module', () => {
    expect(lazy('process.cwd();')).toContain('api node:process.cwd');
  });

  it('keeps counting the import where the platform does not stub modules out', () => {
    expect(usagesOf("import fs from 'node:fs';", 'src/input.js')).toEqual(['api node:fs']);
    expect(usagesOf("import { watch } from 'node:fs';\nwatch('.');")).toEqual([
      'api node:fs',
      'api node:fs.watch',
    ]);
  });
});
