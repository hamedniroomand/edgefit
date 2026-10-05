import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

describe('destructuring a Node.js module', () => {
  it('binds each name, and a nested name, to the member it reads', () => {
    expect(usagesOf("const { promises: { watch } } = require('fs');\nwatch('a');")).toContain(
      'api node:fs.promises.watch',
    );
  });

  it('visits the default of a name and binds the name', () => {
    const found = usagesOf("const { readFile = process.cwd } = require('fs');\nreadFile('a');");
    expect(found).toContain('api node:fs.readFile');
    expect(found).toContain('api node:process.cwd');
  });

  it('reports the module as dynamic when a rest element collects the rest', () => {
    expect(usagesOf("const { readFile, ...rest } = require('fs');\nrest.x;")).toContain(
      'dynamic node:fs',
    );
  });

  it('reports the module as dynamic when a key is computed', () => {
    expect(
      usagesOf("const key = process.argv[2];\nconst { [key]: value } = require('fs');"),
    ).toContain('dynamic node:fs[<expression>]');
  });

  it('visits a pattern that is not an object pattern', () => {
    expect(usagesOf("const { readFile: [first] } = require('fs');")).toContain(
      'api node:fs.readFile',
    );
  });
});

describe('a destructuring assignment of a Node.js module', () => {
  it('reads the names, as a declaration does', () => {
    const required = usagesOf("let watch;\n({ watch } = require('node:fs'));");
    expect(required).toContain('api node:fs.watch');
    expect(required).not.toContain('dynamic node:fs');
    const imported = usagesOf(
      "let DatabaseSync;\n({ DatabaseSync } = await import('node:sqlite'));",
    );
    expect(imported).toContain('api node:sqlite.DatabaseSync');
    expect(imported).not.toContain('dynamic node:sqlite');
  });

  it('reads a name from a const that holds the module specifier', () => {
    const source =
      "let DatabaseSync;\nconst nodeSqlite = 'node:sqlite';\n({ DatabaseSync } = await import(nodeSqlite));";
    const usages = usagesOf(source);
    expect(usages).toContain('api node:sqlite.DatabaseSync');
    expect(usages).not.toContain('dynamic node:sqlite');
  });
});
