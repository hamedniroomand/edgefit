import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

import { keysOf, tls } from './option-keys-helper.ts';

const object = "const options = { ALPNProtocols: ['h2'] };\n";
const call = 'tls.connect(options);';

describe('a call that changes the object', () => {
  it.each([
    ['Object.assign', 'Object.assign(options, { ALPNProtocols: undefined });\n'],
    [
      'Object.defineProperty',
      "Object.defineProperty(options, 'ALPNProtocols', { value: undefined });\n",
    ],
    [
      'Object.defineProperties',
      'Object.defineProperties(options, { ALPNProtocols: { value: undefined } });\n',
    ],
    ['Reflect.deleteProperty', "Reflect.deleteProperty(options, 'ALPNProtocols');\n"],
    [
      'Reflect.defineProperty',
      "Reflect.defineProperty(options, 'ALPNProtocols', { value: undefined });\n",
    ],
    ['Reflect.set', "Reflect.set(options, 'ALPNProtocols', undefined);\n"],
  ])('reads no keys after %s', (_name, change) => {
    expect(keysOf(`${tls}${object}${change}${call}`)).toEqual([]);
  });
});

describe('a change that edgefit does not see', () => {
  it.each([
    ['the object passed to a function', 'normalize(options);\n'],
    [
      'the object held in another object',
      'const holder = { options };\nholder.options.ALPNProtocols = undefined;\n',
    ],
    ['a write through another name', 'const o = options;\no.ALPNProtocols = undefined;\n'],
    ['a destructuring into a member', '[options.ALPNProtocols] = [undefined];\n'],
  ])('keeps the keys of %s', (_name, change) => {
    expect(keysOf(`${tls}${object}${change}${call}`)).toEqual(['ALPNProtocols']);
  });

  it('keeps the keys when another branch passes the object to a function, as got does', () => {
    const source = `${tls}${object}const socket = create ? create(options) : tls.connect(options);`;
    expect(keysOf(source)).toEqual(['ALPNProtocols']);
  });
});

describe('a new value of another name', () => {
  it.each([
    ['an update', 'let i = options;\ni++;\n'],
    ['a compound assignment', 'let i = options;\ni += 1;\n'],
    ['a new object', 'let i = options;\ni = {};\n'],
  ])('keeps the keys of the original after %s', (_name, change) => {
    expect(keysOf(`${tls}${object}${change}${call}`)).toEqual(['ALPNProtocols']);
  });
});

describe('names that do not share an object', () => {
  const fs = "const fs = require('node:fs');\n";

  it.each([
    [
      'a new value for another name',
      "let name = 'readFileSync';\nlet other = name;\nother += 'Sync';\nfs[name]('x');",
    ],
    [
      'a change of one side of a fallback',
      "const a = {};\nconst b = { k: 'readFileSync' };\nconst o = a || b;\na.x = 1;\nfs[b.k]('x');",
    ],
    [
      'the same local name in two functions',
      "const keys = { k: 'readFileSync' };\nfunction f(other) {\n  const o = other;\n  o.k = 'x';\n}\nfunction g() {\n  const o = keys;\n  return o;\n}\nfs[keys.k]('x');",
    ],
  ])('keeps a known computed key after %s', (_name, source) => {
    expect(usagesOf(`${fs}${source}`, 'src/input.js')).toContain('api node:fs.readFileSync');
  });
});

describe('a call through a member of Object.prototype', () => {
  it.each([
    "hasOwnProperty.call(options, 'x');",
    'toString.call(options);',
    'constructor.call(options);',
  ])('does not throw and keeps the keys after `%s`', change => {
    expect(keysOf(`${tls}${object}${change}\n${call}`)).toEqual(['ALPNProtocols']);
  });

  it('does not throw for such a call in a function of a block with a known value', () => {
    const source = `${tls}const map = { k: 'readFileSync' };\nfunction has(o, k) {\n  return hasOwnProperty.call(o, k);\n}\n${object}${call}`;
    expect(keysOf(source)).toEqual(['ALPNProtocols']);
  });
});
