import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

describe('globals', () => {
  it('maps process and its aliases to the process module', () => {
    expect(usagesOf("process.binding('x');\nglobalThis.process.env.FOO;")).toEqual([
      'api node:process.binding',
      'api node:process.env.FOO',
    ]);
  });

  it('records other tracked globals, including through global aliases', () => {
    expect(usagesOf('new BroadcastChannel("a");\nglobal.Buffer.from("a");')).toEqual([
      'api BroadcastChannel',
      'api Buffer.from',
    ]);
  });

  it('treats typeof and in checks as feature detection', () => {
    expect(usagesOf("import fs from 'fs';\ntypeof fs.watch;\n'watch' in fs;")).toEqual([
      'api node:fs',
    ]);
  });

  it('does not report globals that are passed on', () => {
    expect(usagesOf('let out = process.stderr;\nexport default out;')).toEqual([
      'api node:process.stderr',
      'api node:process.stderr',
    ]);
  });
});

describe('dynamic access', () => {
  it('reports computed member access on a module', () => {
    expect(usagesOf("import fs from 'fs';\nfs[key]();")).toEqual([
      'api node:fs',
      'api node:fs',
      'dynamic node:fs[<expression>]',
    ]);
  });

  it('reads string-literal computed keys statically', () => {
    expect(usagesOf("import fs from 'fs';\nfs['watchFile']('a');")).toContain(
      'api node:fs.watchFile',
    );
  });

  it('reports a module object that escapes', () => {
    expect(usagesOf("const fs = require('fs');\nmodule.exports = fs;", 'lib/index.js')).toEqual([
      'api node:fs',
      'api node:fs',
      'dynamic node:fs',
    ]);
  });

  it('does not treat a this-argument as an escape', () => {
    const source = "const util = require('util');\nutil.format.apply(util, args);";
    expect(usagesOf(source, 'lib/index.js')).toEqual([
      'api node:util',
      'api node:util.format',
      'api node:util',
    ]);
  });

  it('reports files that cannot be parsed', () => {
    expect(usagesOf('const = ;')).toEqual(['dynamic <unparsed file>']);
  });
});

describe('keys that cannot name an API', () => {
  it('reads a string-literal key on a global like a property', () => {
    expect(usagesOf("globalThis['Buffer'].from('a');")).toEqual(
      usagesOf("globalThis.Buffer.from('a');"),
    );
  });

  it('does not report a symbol key as a computed access', () => {
    const plain = ['api node:fs', 'api node:fs'];
    expect(usagesOf("import fs from 'fs';\nfs[Symbol.iterator];")).toEqual(plain);
    expect(usagesOf("import fs from 'fs';\nfs[Symbol('x')];")).toEqual(plain);
    expect(usagesOf("import fs from 'fs';\nfs[Symbol.for('x')];")).toEqual(plain);
  });

  it('still reports a key that could be anything', () => {
    expect(usagesOf("import fs from 'fs';\nfs[Symbols.iterator];")).toContain(
      'dynamic node:fs[<expression>]',
    );
  });

  it('does not report the global object itself when it is exported', () => {
    expect(usagesOf('const root = globalThis;\nexport { root };')).toEqual([]);
    expect(usagesOf('export const root = globalThis;')).toEqual([]);
  });
});

describe('a symbol held in a constant', () => {
  it('does not report a computed access with a symbol key', () => {
    expect(usagesOf("const key = Symbol.for('app');\nglobalThis[key] ??= 1;")).toEqual([]);
    expect(usagesOf('const key = Symbol();\nglobalThis[key] ??= 1;')).toEqual([]);
  });

  it('still reports a key that may not be a symbol', () => {
    const reported = ['dynamic globalThis[<expression>]'];
    expect(usagesOf('function get(key) {\n  return globalThis[key];\n}')).toEqual(reported);
    expect(usagesOf("let key = Symbol();\nkey = 'x';\nglobalThis[key];")).toEqual(reported);
    expect(
      usagesOf('const key = Symbol();\nfunction get(key) {\n  return globalThis[key];\n}'),
    ).toEqual(reported);
  });

  it('reads a string-literal key as before', () => {
    expect(usagesOf("globalThis['Buffer'].from('a');")).toEqual(
      usagesOf("globalThis.Buffer.from('a');"),
    );
  });

  it('does not report the registry pattern from the issue', () => {
    const source = [
      "const key = Symbol.for('app.registry');",
      'const g = globalThis as Record<symbol, unknown>;',
      'const registry = (g[key] ??= new WeakMap());',
      'export default {',
      '  fetch() {',
      '    return new Response(String(!!registry));',
      '  },',
      '};',
    ].join('\n');
    expect(usagesOf(source, 'registry.ts')).not.toContain('dynamic globalThis[<expression>]');
  });

  it('still reports a string made from a symbol', () => {
    const reported = ['dynamic globalThis[<expression>]'];
    expect(usagesOf('globalThis[Symbol.keyFor(s)];')).toEqual(reported);
    expect(usagesOf("const k = Symbol('a').description;\nglobalThis[k];")).toEqual(reported);
    expect(usagesOf("globalThis[Symbol.for('a').toString()];")).toEqual(reported);
  });
});

describe('checking for a computed member', () => {
  it('does not report typeof on a computed key as a use', () => {
    expect(usagesOf("if (typeof globalThis[name] > 'u') throw new Error(name);")).toEqual([]);
    expect(
      usagesOf("import fs from 'fs';\nif (typeof fs[name] === 'undefined') throw new Error();"),
    ).toEqual(['api node:fs', 'api node:fs']);
  });

  it('still reports calling a computed member', () => {
    expect(usagesOf('globalThis[name]();')).toEqual(['dynamic globalThis[<expression>]']);
  });
});

describe('destructuring from the global object', () => {
  it('does not count the destructuring as a use', () => {
    expect(usagesOf('const { process, Buffer } = globalThis;')).toEqual([]);
  });

  it('counts each use of the name', () => {
    expect(usagesOf('const { process } = globalThis;\nprocess.cwd();')).toEqual([
      'api node:process.cwd',
    ]);
  });

  it('still counts a member of a module when it is destructured', () => {
    expect(usagesOf("import fs from 'fs';\nconst { watch } = fs;")).toContain('api node:fs.watch');
  });

  it('guards a use after a check, including void 0', () => {
    const source =
      'const { process } = globalThis;\nconst noColor = process !== void 0 ? process.env.NO_COLOR : undefined;';
    expect(usagesOf(source)).toEqual(['api node:process.env.NO_COLOR [guarded]']);
  });
});
