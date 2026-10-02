import { describe, expect, it } from 'vite-plus/test';

import { extractModule } from '@/extract/index.ts';
import { usagesOf } from '~/helpers.ts';

describe('imports that are used only as types', () => {
  it('skips an import that is used in type positions only', () => {
    const source = [
      "import { ServerResponse } from 'node:http';",
      'export const response = {} as ServerResponse;',
      'export function send(value: ServerResponse): ServerResponse { return value; }',
      'export interface Reply extends ServerResponse {}',
      'export type Kind = typeof ServerResponse;',
    ].join('\n');
    expect(usagesOf(source)).toEqual([]);
  });

  it('gives no finding for the Worker in the issue', () => {
    const source = `import { ServerResponse } from 'node:http'
export default {
  fetch() {
    const response = {} as ServerResponse
    return new Response(String(!!response))
  },
}`;
    expect(usagesOf(source)).toEqual([]);
  });

  it('skips an import that a class only implements', () => {
    expect(
      usagesOf("import { ServerResponse } from 'node:http';\nclass A implements ServerResponse {}"),
    ).toEqual([]);
  });

  it('skips default and namespace imports that are used as types only', () => {
    const source =
      "import fs from 'node:fs';\nimport * as http from 'node:http';\nlet a: typeof fs;\nlet b: http.Server;";
    expect(usagesOf(source)).toEqual([]);
  });
});

describe('imports that are used as values', () => {
  it('keeps an import that is used as a value', () => {
    expect(usagesOf("import { watch } from 'node:fs';\nwatch('.');")).toContain(
      'api node:fs.watch',
    );
    expect(usagesOf("import { Server } from 'node:http';\nclass A extends Server {}")).toContain(
      'api node:http.Server',
    );
  });

  it('reports only the bindings that are used as values', () => {
    const source = "import { watch, Dirent } from 'node:fs';\nlet entry: Dirent;\nwatch('.');";
    expect(usagesOf(source)).toEqual(['api node:fs', 'api node:fs.watch']);
  });

  it('keeps an import that is used in typeof and instanceof as a value', () => {
    const source =
      "import { Server } from 'node:http';\nconst a = typeof Server === 'function';\nconst b = {} instanceof Server;";
    expect(usagesOf(source)).toContain('api node:http.Server');
  });

  it('keeps an import that an enum member reads', () => {
    const source = "import { constants } from 'node:fs';\nenum Mode { Read = constants.O_RDONLY }";
    expect(usagesOf(source)).toContain('api node:fs.constants.O_RDONLY');
  });
});

describe('enums', () => {
  it('does not read the names of an enum as global APIs', () => {
    expect(usagesOf('enum E { Buffer = 1, process = 2 }\nexport const a = E.Buffer;')).toEqual([]);
    expect(usagesOf('enum Buffer { A }')).toEqual([]);
  });

  it('keeps an import that is exported or used in JSX', () => {
    expect(usagesOf("import { watch } from 'node:fs';\nexport { watch };")).toContain(
      'api node:fs.watch',
    );
    expect(
      usagesOf("import { Server } from 'node:http';\nconst a = <Server />;", 'a.tsx'),
    ).toContain('api node:http.Server');
  });

  it('ignores an export of a name as a type', () => {
    expect(usagesOf("import { Server } from 'node:http';\nexport type { Server };")).toEqual([]);
  });

  it('keeps every import when the bundler keeps unused imports', () => {
    const source = "import { ServerResponse } from 'node:http';\nlet a: ServerResponse;";
    expect(usagesOf(source, 'src/input.ts', undefined, { keepUnusedImports: true })).toEqual([
      'api node:http',
      'api node:http.ServerResponse',
    ]);
  });
});

describe('imports that a bundler keeps', () => {
  it('keeps an import with no names', () => {
    expect(usagesOf("import 'node:http';")).toEqual(['api node:http']);
  });

  it('leaves type-only imports out of the module shape', () => {
    const source =
      "import { Server } from 'node:http';\nimport { watch, Dirent } from 'node:fs';\nlet a: Server;\nlet b: Dirent;\nwatch('.');";
    const { shape } = extractModule('src/input.ts', source, {
      globals: new Set(),
      nodeEnv: undefined,
      shape: true,
    });
    expect([...(shape?.imports.keys() ?? [])]).toEqual(['watch']);
    expect(shape?.imports.has('Server')).toBe(false);
  });
});
