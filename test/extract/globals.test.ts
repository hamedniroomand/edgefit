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
