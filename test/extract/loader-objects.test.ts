import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const loaders =
  "const loaders = {\n  __proto__: null,\n  'node:zlib': () => require('node:zlib'),\n  'node:vm': () => require('node:vm'),\n};\n";

describe('an object of functions that only return a require', () => {
  it('reads a call with a key that is not known as a load of every module', () => {
    const usages = usagesOf(`${loaders}function load(name) {\n  loaders[name]();\n}`);
    expect(usages).toEqual(['api node:zlib', 'api node:vm']);
  });

  it('reads a call with a key that is a string as a load of that module only', () => {
    expect(usagesOf(`${loaders}loaders['node:vm']();`)).toEqual(['api node:vm']);
  });

  it('reads a call in a try as caught', () => {
    expect(usagesOf(`${loaders}try {\n  loaders[name]();\n} catch {}`)).toEqual([
      'api node:zlib [guarded]',
      'api node:vm [guarded]',
    ]);
  });

  it('reads a function that has a try and returns nothing when it fails', () => {
    const source =
      "const loaders = {\n  zlib() {\n    try {\n      return require('node:zlib');\n    } catch {\n      return undefined;\n    }\n  },\n};\nloaders[name]();";
    expect(usagesOf(source)).toEqual(['api node:zlib [guarded]']);
  });
});

describe('an object of functions that something else uses', () => {
  it('keeps the unknown for a module that the code returns from the call', () => {
    expect(usagesOf(`${loaders}function load(name) {\n  return loaders[name]();\n}`)).toContain(
      'dynamic node:zlib',
    );
  });

  it.each([
    ['passes the object on', 'use(loaders);'],
    ['reads a member without a call', 'const zlib = loaders.zlib;'],
    ['calls a function with an argument', "loaders['node:vm'](1);"],
    ['calls a key that it lacks', "loaders['node:fs']();"],
    ['never calls it', ''],
  ])('keeps the unknown when the code %s', (_name, code) => {
    const usages = usagesOf(`${loaders}${code}`);
    expect(usages).toContain('dynamic node:zlib');
  });

  it('keeps the unknown for an object that has a value that is not a loader', () => {
    const source =
      "const loaders = {\n  zlib: () => require('node:zlib'),\n  other: () => compute(),\n};\nloaders[name]();";
    expect(usagesOf(source)).toContain('dynamic node:zlib');
  });
});
