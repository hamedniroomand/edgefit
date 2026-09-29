import { describe, expect, it } from 'vite-plus/test';

import { uncheckedImports } from '@/core/unchecked-imports.ts';

describe('unchecked imports', () => {
  it('reports jsr: packages as unknown usages at their import', () => {
    const source = "import x from 'x';\nimport { join } from 'jsr:@std/path@^1/join';\n";
    const [usage, ...rest] = uncheckedImports('src/main.ts', source, [
      'jsr:@std/path@^1/join',
      'node:fs',
    ]);
    expect(rest).toEqual([]);
    expect(usage).toMatchObject({
      kind: 'dynamic',
      api: undefined,
      display: 'jsr:@std/path@^1/join',
      reason: 'jsr: packages are not scanned yet',
      location: { file: 'src/main.ts', line: 2, column: 23 },
    });
  });

  it('locates an import map key by the package name', () => {
    const source = "import { join } from '@std/path';\n";
    const [usage] = uncheckedImports('src/main.ts', source, ['jsr:/@std/path@^1']);
    expect(usage?.location).toEqual({ file: 'src/main.ts', line: 1, column: 23 });
  });

  it('ignores specifiers that are not jsr: packages', () => {
    expect(uncheckedImports('a.ts', '', ['npm:chalk', 'node:fs', 'jsr:unscoped'])).toEqual([]);
  });
});
