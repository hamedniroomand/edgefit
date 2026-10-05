import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const fs = "import fs from 'node:fs';\n";
const run = (code: string): string[] => usagesOf(`${fs}${code}`, 'src/input.mjs');
const guarded = ['api node:fs', 'api node:fs.watch [option http2]'];
const plain = ['api node:fs', 'api node:fs.watch'];

describe('code behind a test of an option that its function gets', () => {
  it.each([
    ['a member', 'function f(options) { if (options.http2) fs.watch("."); }'],
    [
      'a comparison with true',
      'function f(options) { if (options.http2 === true) fs.watch("."); }',
    ],
    [
      'a comparison with true on the left',
      'function f(options) { if (true === options.http2) fs.watch("."); }',
    ],
    ['an && chain', 'function f(options, x) { if (x && options.http2) fs.watch("."); }'],
    ['a condition', 'function f(options) { return options.http2 ? fs.watch(".") : 0; }'],
    ['an && value', 'function f(options) { return options.http2 && fs.watch("."); }'],
    [
      'a parameter with a default',
      'function f(options = {}) { if (options.http2) fs.watch("."); }',
    ],
    [
      'a name that ends in Options',
      'function f(serverOptions) { if (serverOptions.http2) fs.watch("."); }',
    ],
    ['an arrow function', 'const f = options => { if (options.http2) fs.watch("."); };'],
  ])('is conditional for %s', (_label, code) => {
    expect(run(code)).toEqual(guarded);
  });

  it('is conditional for the code after an if that leaves when the option is not set', () => {
    expect(run('function f(options) { if (!options.http2) return; fs.watch("."); }')).toEqual(
      guarded,
    );
  });

  it('is conditional for the else branch of a negated test', () => {
    expect(
      run('function f(options) { if (!options.http2) { x(); } else { fs.watch("."); } }'),
    ).toEqual(guarded);
  });

  it('keeps the name of each option', () => {
    expect(run('function f(opts) { if (opts.a) { if (opts.b) fs.watch("."); } }')).toEqual([
      'api node:fs',
      'api node:fs.watch [option a b]',
    ]);
  });
});

describe('code that is not behind an option of its function', () => {
  it.each([
    [
      'the else branch',
      'function f(options) { if (options.http2) { x(); } else { fs.watch("."); } }',
    ],
    ['a negated test', 'function f(options) { if (!options.http2) fs.watch("."); }'],
    ['a local variable', 'function f() { const options = g(); if (options.http2) fs.watch("."); }'],
    ['a member of a member', 'function f(options) { if (options.a.http2) fs.watch("."); }'],
    ['a computed member', 'function f(options) { if (options["http2"]) fs.watch("."); }'],
    [
      'a parameter that is not an options object',
      'function f(req) { if (req.http2) fs.watch("."); }',
    ],
    ['a socket parameter', 'function f(socket) { if (socket.encrypted) fs.watch("."); }'],
    ['a destructured parameter', 'function f({ http2 }) { if (http2) fs.watch("."); }'],
    [
      'a comparison with false',
      'function f(options) { if (options.http2 === false) fs.watch("."); }',
    ],
    ['an || chain', 'function f(options, x) { if (x || options.http2) fs.watch("."); }'],
    [
      'a name that an inner scope declares',
      'function f(options) { { const options = g(); if (options.http2) fs.watch("."); } }',
    ],
  ])('has no condition for %s', (_label, code) => {
    expect(run(code)).toEqual(plain);
  });
});
