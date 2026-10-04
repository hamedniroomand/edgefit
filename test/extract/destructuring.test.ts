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
