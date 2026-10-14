import { describe, expect, it } from 'vite-plus/test';

import { connect, keysOf, tls } from './option-keys-helper.ts';

describe('a regular expression on the left of `&&`', () => {
  it.each(['/x/', '/(?<a>x)(?<a>y)/'])('is not read as null: %s', regex => {
    const options = `ALPNProtocols: ['h2'], ...(${regex} && { ALPNProtocols: undefined })`;
    expect(keysOf(connect(options))).toEqual([]);
  });
});

describe('a read of a Node.js module', () => {
  it('counts a direct member of a module as defined', () => {
    expect(keysOf(connect('checkServerIdentity: tls.checkServerIdentity'))).toEqual([
      'checkServerIdentity',
    ]);
  });

  it.each([
    ['a member of a named import', "const { env } = require('node:process');\n", 'env.ALPN'],
    ['a deeper member of a module', "const p = require('node:process');\n", 'p.argv[9]'],
  ])('does not count %s', (_name, binding, value) => {
    expect(keysOf(`${tls}${binding}tls.connect({ ALPNProtocols: ${value} });`)).toEqual([]);
  });
});

describe('a key that is a Symbol or a number', () => {
  it.each([
    ['a Symbol key', "[Symbol('x')]: 1"],
    ['a Symbol.for key', "[Symbol.for('x')]: 1"],
    ['a spread with a numeric key', '...{ 0: 1 }'],
  ])('keeps the key before %s', (_name, property) => {
    expect(keysOf(connect(`ALPNProtocols: ['h2'], ${property}`))).toContain('ALPNProtocols');
  });

  it('reads a numeric key as its string', () => {
    expect(keysOf(connect("ALPNProtocols: ['h2'], 0: 1"))).toEqual(['ALPNProtocols', '0=1']);
  });
});

describe('a spread of `?:` with two object literals', () => {
  it.each([
    ['keeps a key that no branch writes', "...(on ? { host: 'a' } : {})", ['ALPNProtocols']],
    [
      'drops a key that a branch sets to undefined',
      '...(on ? { ALPNProtocols: undefined } : {})',
      [],
    ],
    [
      'keeps a key that a known test skips',
      '...(true ? {} : { ALPNProtocols: undefined })',
      ['ALPNProtocols'],
    ],
    ['drops the keys before a `||` spread', "...(extra || { host: 'a' })", []],
    ['drops the keys when one branch is not a literal', "...(on ? { host: 'a' } : extra)", []],
  ])('%s', (_name, spread, keys) => {
    expect(keysOf(connect(`ALPNProtocols: ['h2'], ${spread}`))).toEqual(keys);
  });

  it('adds a key that both branches give a defined value', () => {
    const options = "...(on ? { ALPNProtocols: ['a'] } : { ALPNProtocols: ['b'] })";
    expect(keysOf(connect(options))).toEqual(['ALPNProtocols']);
  });
});

describe('a call that tls itself defines', () => {
  it('reads the module itself as defined', () => {
    expect(keysOf(`${tls}tls.connect({ secureContext: tls });`)).toEqual(['secureContext']);
  });
});
