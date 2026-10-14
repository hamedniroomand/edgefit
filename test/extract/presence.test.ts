import { describe, expect, it } from 'vite-plus/test';

import { extractUsages } from '@/extract/index.ts';

const tls = "const tls = require('node:tls');\n";

/** The keys that the first `node:tls` call passes, with `=value` for a literal value. */
function keysOf(source: string): string[] {
  const call = extractUsages('src/input.js', source, {
    globals: new Set(),
    nodeEnv: 'production',
  }).find(usage => usage.display.startsWith('node:tls.') && usage.passedKeys !== undefined);
  return (call?.passedKeys ?? []).map(({ key, value }) =>
    value === undefined ? key : `${key}=${String(value)}`,
  );
}

const connect = (options: string): string => `${tls}tls.connect({ ${options} });`;

describe('a key whose value may be undefined', () => {
  it.each([
    ['a member read', 'ALPNProtocols: opts.ALPNProtocols'],
    ['a name with an unknown value', 'ALPNProtocols: maybe'],
    ['`&&`', "ALPNProtocols: on && ['h2']"],
    ['a branch that gives undefined', "ALPNProtocols: on ? ['h2'] : undefined"],
    ['a getter', 'get ALPNProtocols() { return list; }'],
  ])('does not count %s', (_name, options) => {
    expect(keysOf(connect(options))).toEqual([]);
  });

  it('does not count a const that holds undefined', () => {
    const source = `${tls}const absent = undefined;\ntls.connect({ ALPNProtocols: absent });`;
    expect(keysOf(source)).toEqual([]);
  });
});

describe('a key whose value is always defined', () => {
  it.each([
    [
      'a branch of arrays, as undici writes it',
      "ALPNProtocols: h2 ? (first ? ['h2'] : ['x']) : ['x']",
    ],
    ['`??` with a literal fallback, as got writes it', "ALPNProtocols: o.ALPNProtocols ?? ['h2']"],
    ['`||` with a literal fallback', 'ALPNProtocols: list || []'],
    ['a template', 'servername: `${host}`'],
    ['an arrow function', 'checkServerIdentity: () => undefined'],
    ['a class', 'session: class {}'],
    ['a new object', 'secureContext: new Context()'],
  ])('counts %s', (_name, options) => {
    expect(keysOf(connect(options))).toHaveLength(1);
  });

  it('counts a branch with a member of a Node.js module, as mysql2 writes it', () => {
    const options = 'checkServerIdentity: verify ? tls.checkServerIdentity : function () {}';
    expect(keysOf(connect(options))).toEqual(['checkServerIdentity']);
  });

  it('reads the value of a const that holds a string', () => {
    expect(keysOf(`${tls}const name = 'a';\ntls.connect({ servername: name });`)).toEqual([
      'servername=a',
    ]);
  });

  it('counts `!` before a name, with no literal value', () => {
    expect(keysOf(connect('rejectUnauthorized: !verify'))).toEqual(['rejectUnauthorized']);
  });

  it.each([
    ['-1', 'minDHSize=-1'],
    ['+2', 'minDHSize=2'],
  ])('folds %s to a number', (literal, key) => {
    expect(keysOf(connect(`minDHSize: ${literal}`))).toEqual([key]);
  });
});

describe('a local name undefined', () => {
  it('reads a local const named undefined as that const', () => {
    const source = `${tls}function f() {\n  const undefined = ['h2'];\n  return tls.connect({ ALPNProtocols: undefined });\n}`;
    expect(keysOf(source)).toEqual(['ALPNProtocols']);
  });

  it('does not count a parameter named undefined, because its value is not known', () => {
    const source = `${tls}function f(undefined) {\n  return tls.connect({ ALPNProtocols: undefined });\n}`;
    expect(keysOf(source)).toEqual([]);
  });
});

describe('the argument that holds the options', () => {
  it('reads only the options of `new TLSSocket(socket, options)`', () => {
    const source = `${tls}new tls.TLSSocket({ ALPNProtocols: ['h2'] }, { host: 'a' });`;
    expect(keysOf(source)).toEqual(['host=a']);
  });

  it.each([
    ['connect(options, callback)', 'tls.connect({ ALPNProtocols: [] }, () => {});'],
    ['connect(port, options)', 'tls.connect(443, { ALPNProtocols: [] });'],
  ])('reads the options of %s', (_name, call) => {
    expect(keysOf(`${tls}${call}`)).toEqual(['ALPNProtocols']);
  });

  it('reads nothing when a spread argument hides the options', () => {
    expect(keysOf(`${tls}tls.connect(...args, { ALPNProtocols: [] });`)).toEqual([]);
  });
});

describe('a key before a spread', () => {
  it('keeps a key when a later spread is a known literal without it, as got writes it', () => {
    const source = `${tls}const options = {\n  ...connection,\n  ALPNProtocols: given.ALPNProtocols ?? ['h2'],\n  host,\n  ...(check && { checkServerIdentity: check }),\n};\ntls.connect(443, 'a', options);`;
    expect(keysOf(source)).toEqual(['ALPNProtocols']);
  });

  it('keeps a key and adds the keys of a later known literal', () => {
    expect(keysOf(connect("ALPNProtocols: [], ...{ host: 'a' }"))).toEqual([
      'ALPNProtocols',
      'host=a',
    ]);
  });

  it.each([
    ['a spread of an unknown value', 'ALPNProtocols: [], ...opts'],
    [
      'a literal that sets the key to undefined',
      'ALPNProtocols: [], ...{ ALPNProtocols: undefined }',
    ],
    ['a literal that may set the key', "ALPNProtocols: [], ...(on && { ALPNProtocols: ['x'] })"],
    ['a computed key that is not known', 'ALPNProtocols: [], [name]: value'],
    ['a literal that holds a spread of its own', 'ALPNProtocols: [], ...{ ...more }'],
  ])('drops the key for %s', (_name, options) => {
    expect(keysOf(connect(options))).toEqual([]);
  });
});

describe('a member write after the object is made', () => {
  const object = "const options = { ALPNProtocols: ['h2'] };\n";

  it.each([
    ['an assignment', 'options.ALPNProtocols = undefined;\n'],
    ['a delete', 'delete options.ALPNProtocols;\n'],
    ['a computed assignment', 'options[name] = value;\n'],
    [
      'a write in a nested function',
      'function reset() {\n  options.ALPNProtocols = undefined;\n}\n',
    ],
  ])('reads no keys after %s', (_name, write) => {
    expect(keysOf(`${tls}${object}${write}tls.connect(options);`)).toEqual([]);
  });

  it('keeps the keys when nothing writes to a member', () => {
    expect(keysOf(`${tls}${object}tls.connect(options);`)).toEqual(['ALPNProtocols']);
  });
});
