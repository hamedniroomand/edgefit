import { describe, expect, it } from 'vite-plus/test';

import { extractUsages } from '@/extract/index.ts';

function supplied(source: string): boolean[] {
  return extractUsages('src/input.ts', source, {
    globals: new Set(['require']),
    nodeEnv: 'production',
  })
    .filter(usage => usage.kind === 'dynamic')
    .map(usage => usage.supplied === true);
}

const loads = {
  'a parameter': 'function load(name) {\n  return require(name);\n}',
  'a property of an options parameter':
    'function load(options) {\n  return require(options.engine);\n}',
  'a variable that is set from a parameter':
    'function load(name) {\n  const mod = name.slice(1);\n  return require(mod);\n}',
  'an import of a parameter': 'async function load(name) {\n  return import(name);\n}',
  'a parameter of a function around it': 'function load(name) {\n  return () => require(name);\n}',
  'a member of this that is set from a parameter':
    'function View(name) {\n  this.ext = extname(name);\n  return require(this.ext.slice(1));\n}',
  'a function that the file exports':
    'function View(name) {\n  return require(name);\n}\nmodule.exports = View;',
  'a function that the file calls through a member':
    'function load(name) {\n  return require(name);\n}\nexports.load = load;\nthis.load(x);',
  'a conditional between values':
    'function load(name) {\n  return require(flag ? name : other);\n}',
  'a choice between values': 'function load(name) {\n  return require(name || fallback);\n}',
};

const others = {
  'a prefix and a parameter': "function load(name) {\n  return require('./locales/' + name);\n}",
  'a template with a prefix': 'function load(name) {\n  return require(`./locales/${name}`);\n}',
  'a variable that holds a prefix':
    "function load(name) {\n  const p = './x/' + name;\n  return require(p);\n}",
  'a name from outside': 'function load() {\n  return require(name);\n}',
  'a name at the top of the file': 'require(name);',
  'a call without a parameter': 'function load(name) {\n  return require(pick());\n}',
  'a function that the file calls by its name':
    'function load(name) {\n  return require(name);\n}\nload(config.driver);',
  'a function that the file builds with new':
    'function View(name) {\n  this.m = require(name);\n}\nnew View(config.driver);',
  'a variable that is set from itself':
    'function load(name) {\n  let mod = mod + 1;\n  return require(mod);\n}',
};

describe('a require or import of a name that the caller gives', () => {
  it.each(Object.entries(loads))('is supplied for %s', (_name, code) => {
    expect(supplied(code)).toEqual([true]);
  });
});

describe('a require or import of a name that nothing gives', () => {
  it.each(Object.entries(others))('is not supplied for %s', (_name, code) => {
    expect(supplied(code)).toEqual([false]);
  });
});
