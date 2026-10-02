import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

describe('extracting ES module imports', () => {
  it('records named imports with and without the node: prefix', () => {
    const source =
      "import { watch } from 'node:fs';\nimport { join } from 'path';\nwatch(join('.'));";
    expect(usagesOf(source)).toEqual([
      'api node:fs',
      'api node:fs.watch',
      'api node:path',
      'api node:path.join',
    ]);
  });

  it('follows member chains on default and namespace imports', () => {
    const source =
      "import fs from 'fs';\nimport * as cp from 'child_process';\nfs.promises.watch('.');\ncp.exec('ls');";
    expect(usagesOf(source)).toContain('api node:fs.promises.watch');
    expect(usagesOf(source)).toContain('api node:child_process.exec');
  });

  it('ignores type-only imports', () => {
    expect(usagesOf("import type { Stats } from 'fs';\nimport { type Dirent } from 'fs';")).toEqual(
      ['api node:fs'],
    );
  });

  it('ignores imports of packages that are not built-ins', () => {
    expect(usagesOf("import { watch } from 'chokidar';\nwatch('.');")).toEqual([]);
  });

  it('records re-exports and marks them as escaping', () => {
    expect(usagesOf("export { watch } from 'fs';\nexport * from 'vm';")).toEqual([
      'api node:fs.watch',
      'dynamic node:fs.watch',
      'api node:vm',
      'dynamic node:vm',
    ]);
  });

  it('follows awaited dynamic imports', () => {
    const source =
      "const v8 = await import('node:v8');\nv8.serialize(1);\n(await import('vm')).runInThisContext('1');";
    expect(usagesOf(source)).toEqual([
      'api node:v8',
      'api node:v8.serialize',
      'api node:vm.runInThisContext',
    ]);
  });
});

describe('extracting dynamic imports', () => {
  it('reports dynamic imports with computed specifiers', () => {
    expect(usagesOf('await import(name);')).toEqual(['dynamic import(<expression>)']);
  });
});
