import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const lib = (source: string): string[] => usagesOf(source, 'lib/index.js');
const tryRequire =
  "function tryRequire() {\n  try {\n    return require('node:async_hooks');\n  } catch (e) {\n    return {};\n  }\n}\n";
const plain = "function load() {\n  return require('node:async_hooks');\n}\n";

describe('a function that only returns a require', () => {
  it('makes a variable that holds the call a module binding', () => {
    expect(lib(`${plain}const hooks = load();\nhooks.AsyncLocalStorage;`)).toEqual([
      'api node:async_hooks',
      'api node:async_hooks.AsyncLocalStorage',
    ]);
  });

  it('does the same with a try that returns nothing, and guards the call', () => {
    expect(lib(`${tryRequire}var hooks = tryRequire();\nhooks.AsyncLocalStorage;`)).toEqual([
      'api node:async_hooks [guarded]',
      'api node:async_hooks.AsyncLocalStorage',
    ]);
  });

  it('follows a variable that is set once from the call', () => {
    expect(lib(`${plain}let hooks;\nhooks = load();\nhooks.AsyncLocalStorage;`)).toContain(
      'api node:async_hooks.AsyncLocalStorage',
    );
  });

  it('reads an arrow function, and a function that is declared below its use', () => {
    expect(lib("const hooks = load();\nconst load = () => require('node:async_hooks');")).toEqual([
      'api node:async_hooks',
    ]);
    expect(
      lib("const hooks = load();\nfunction load() {\n  return require('node:vm');\n}"),
    ).toEqual(['api node:vm']);
  });
});

describe('a function that only returns a require, and is not followed', () => {
  it.each([
    ['a parameter', "function load(name) {\n  return require('node:vm');\n}\nconst m = load('x');"],
    [
      'a second statement',
      "function load() {\n  init();\n  return require('node:vm');\n}\nconst m = load();",
    ],
    [
      'a catch that does something',
      "function load() {\n  try {\n    return require('node:vm');\n  } catch (e) {\n    return other();\n  }\n}\nconst m = load();",
    ],
    [
      'a function that is passed on',
      "function load() {\n  return require('node:vm');\n}\nuse(load);\nconst m = load();",
    ],
    ['a function that is never called', "function load() {\n  return require('node:vm');\n}"],
    [
      'a call with an argument',
      "function load() {\n  return require('node:vm');\n}\nconst m = load(1);",
    ],
  ])('does not follow %s', (_name, source) => {
    // A module binding counts the members that are read from it.
    expect(lib(`${source}\nm.runInContext;`)).not.toContain('api node:vm.runInContext');
  });

  it('is followed when it is called as expected', () => {
    const source =
      "function load() {\n  return require('node:vm');\n}\nconst m = load();\nm.runInContext;";
    expect(lib(source)).toContain('api node:vm.runInContext');
  });
});
