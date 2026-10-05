import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const unknown = 'dynamic node:process.stderr';
const log = "import process from 'node:process';\n";

describe('a module that is passed to a function of the same file', () => {
  it('counts the members that the function reads on the parameter', () => {
    const usages = usagesOf(
      `${log}function print(stream, text) {\n  stream.write(text);\n  stream.end();\n}\nprint(process.stderr, 'x');`,
    );
    expect(usages).toContain('api node:process.stderr.write');
    expect(usages).toContain('api node:process.stderr.end');
    expect(usages.filter(usage => usage.startsWith('dynamic'))).toEqual([]);
  });

  it('follows an arrow function that a const holds', () => {
    const usages = usagesOf(
      `${log}const print = stream => stream.write('x');\nprint(process.stderr);`,
    );
    expect(usages).toContain('api node:process.stderr.write');
    expect(usages).not.toContain(unknown);
  });
});

describe('a function that uses its parameter in another way', () => {
  it.each([
    ['stores it', 'function print(stream) {\n  saved = stream;\n}'],
    ['returns it', 'function print(stream) {\n  return stream;\n}'],
    ['passes it on', 'function print(stream) {\n  other(stream);\n}'],
    ['reads a member with a computed key', 'function print(stream) {\n  stream[name]();\n}'],
    ['sets a member', 'function print(stream) {\n  stream.write = null;\n}'],
    ['declares the name again', 'function print(stream) {\n  (stream => stream.x)(1);\n}'],
  ])('keeps the unknown when the function %s', (_name, fn) => {
    expect(usagesOf(`${log}${fn}\nprint(process.stderr);`)).toContain(unknown);
  });

  it('follows a read through parentheses and a type assertion', () => {
    expect(
      usagesOf(`${log}function print(stream) {\n  (stream).write('x');\n}\nprint(process.stderr);`),
    ).toContain('api node:process.stderr.write');
    expect(
      usagesOf(
        `${log}function print(stream) {\n  (stream as Writable).write('x');\n}\nprint(process.stderr);`,
        'file.ts',
      ),
    ).toContain('api node:process.stderr.write');
  });

  it.each([
    [
      'a destructured parameter',
      'function print({ write }) {\n  write();\n}\nprint(process.stderr);',
    ],
    [
      'a name that the file sets again',
      'let print = s => s.write();\nprint = other;\nprint(process.stderr);',
    ],
  ])('keeps the unknown for %s', (_name, code) => {
    expect(usagesOf(`${log}${code}`)).toContain(unknown);
  });

  it('keeps the unknown for a function that another file declares', () => {
    expect(usagesOf(`${log}print(process.stderr);`)).toContain(unknown);
  });

  it('keeps the unknown when the name is declared twice', () => {
    expect(
      usagesOf(
        `${log}function print(s) {\n  s.write();\n}\nfunction print(s) {\n  s.end();\n}\nprint(process.stderr);`,
      ),
    ).toContain(unknown);
  });
});

describe('a module passed to a function that is called at once', () => {
  it('counts the members that the function reads on the parameter', () => {
    const usages = usagesOf(
      `${log}(function (stream) {\n  stream.write('x');\n})(process.stderr);`,
    );
    expect(usages).toContain('api node:process.stderr.write');
    expect(usages.filter(usage => usage.startsWith('dynamic'))).toEqual([]);
  });

  it('keeps the unknown when the parameter is passed to another function', () => {
    const source = [
      "const events = require('events');",
      '(function (superClass) { other(Parser, superClass); })(events);',
    ].join('\n');
    expect(usagesOf(source)).toContain('dynamic node:events');
  });

  it('keeps the unknown when the parameter is assigned again', () => {
    const usages = usagesOf(
      `${log}(function (stream) {\n  stream = null;\n  stream.write('x');\n})(process.stderr);`,
    );
    expect(usages).toContain(unknown);
  });
});

describe('a parameter that is a parent class', () => {
  const events = "const events = require('events');\n";

  it('counts a member of the parameter that a class extends', () => {
    const usages = usagesOf(
      `${events}module.exports = (function (mod) {\n  return class A extends mod.EventEmitter {};\n})(events);`,
    );
    expect(usages).toContain('api node:events.EventEmitter');
    expect(usages).toContain('dynamic node:events.EventEmitter');
    expect(usages).not.toContain('dynamic node:events');
  });

  it('reads a call, apply or bind of the parameter as the parameter itself', () => {
    const source = [
      "const { EventEmitter } = require('events');",
      'function extend(child, parent) {',
      '  function ctor() {}',
      '  ctor.prototype = parent.prototype;',
      '  child.prototype = new ctor();',
      '}',
      'module.exports = (function (Parent) {',
      '  function Child() { Parent.call(this); }',
      '  extend(Child, Parent);',
      '  return Child;',
      '})(EventEmitter);',
    ].join('\n');
    const usages = usagesOf(source);
    expect(usages).toContain('dynamic node:events.EventEmitter');
    expect(usages).not.toContain('api node:events.EventEmitter.call');
  });
});

describe('an arrow that is called at once', () => {
  it('counts the members that the arrow reads on the parameter', () => {
    const usages = usagesOf(`${log}(stream => stream.write('x'))(process.stderr);`);
    expect(usages).toContain('api node:process.stderr.write');
    expect(usages.filter(usage => usage.startsWith('dynamic'))).toEqual([]);
  });
});

describe('an object of modules that is passed to a function of the same file', () => {
  const wrap = "import http from 'node:http';\nimport https from 'node:https';\n";

  it('counts the members that the function reads under a key', () => {
    const usages = usagesOf(
      `${wrap}function wrap(protocols) {\n  return protocols.http.request;\n}\nwrap({ http, https });`,
    );
    expect(usages).toContain('api node:http.request');
    expect(usages).not.toContain('api node:https.request');
    expect(usages.filter(usage => usage.startsWith('dynamic'))).toEqual([]);
  });

  it('counts a read with a key that is not a string for every module', () => {
    const usages = usagesOf(
      `${wrap}function wrap(protocols, scheme) {\n  return protocols[scheme].request;\n}\nwrap({ http, https }, 'x');`,
    );
    expect(usages).toContain('api node:http.request');
    expect(usages).toContain('api node:https.request');
  });

  it('keeps the unknown when the function reads the key without a member', () => {
    const usages = usagesOf(
      `${wrap}function wrap(protocols) {\n  return Object.keys(protocols);\n}\nwrap({ http });`,
    );
    expect(usages).toContain('dynamic node:http');
  });
});
