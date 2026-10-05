import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const fs = "import fs from 'node:fs';\n";
const plainWatch = ['api node:fs', 'api node:fs.watch'];

const guardedWatch = ['api node:fs', 'api node:fs.watch [guarded]'];

describe('an operand of || and ??', () => {
  it('records a guarded use for a value that is stored', () => {
    expect(usagesOf(`${fs}const f = fs.watch ?? fs.watchFile;`)).toEqual([
      'api node:fs',
      'api node:fs.watch [guarded]',
      'api node:fs.watchFile [guarded]',
    ]);
    expect(usagesOf(`${fs}const f = fs.watch || fallback;`)).toEqual(guardedWatch);
    expect(usagesOf(`${fs}const f = fs.watch || fs.watchFile || fallback;`)).toEqual([
      'api node:fs',
      'api node:fs.watch [guarded]',
      'api node:fs.watchFile [guarded]',
    ]);
  });

  it('records a guarded use through a wrapper', () => {
    expect(usagesOf(`${fs}const f = (fs.watch as any) || fallback;`)).toEqual(guardedWatch);
  });

  it('records the right operand as a plain use when the left one is not an API', () => {
    expect(usagesOf(`${fs}const f = fallback || fs.watch;`)).toEqual(plainWatch);
  });

  it('records the use when the value is called in place', () => {
    expect(usagesOf(`${fs}(fs.watch || fallback)('.');`)).toEqual(plainWatch);
    expect(usagesOf(`${fs}(fs.watch ?? fallback)('.');`)).toEqual(plainWatch);
    expect(usagesOf(`${fs}((fs.watch || fallback) as any)('.');`)).toEqual(plainWatch);
  });

  it('records the use of an operand of other operators', () => {
    expect(usagesOf(`${fs}const f = fs.watch && fallback;`)).toEqual(['api node:fs']);
    expect(usagesOf(`${fs}const f = [fs.watch];`)).toContain('api node:fs.watch');
  });
});

describe('a read that a fallback statement follows', () => {
  const globals = new Set(['console']);
  const usages = (source: string): string[] => usagesOf(source, 'src/input.ts', globals);
  const fallback = "if (typeof f !== 'function') f = console.error;";

  it.each([
    ['an assignment', `let f;\nf = console.log;\n${fallback}`],
    ['a declaration', `let f = console.log;\n${fallback}`],
    ['a test with !', 'let f = console.log;\nif (!f) { f = console.error; }'],
    ['a test with === undefined', 'let f = console.log;\nif (f === undefined) f = console.error;'],
    ['a test with == null', 'let f = console.log;\nif (f == null) f = console.error;'],
  ])('guards the read of %s', (_name, code) => {
    expect(usages(code)).toEqual(['api console.log [guarded]', 'api console.error']);
  });

  it('guards each known key, as the || form does', () => {
    const key = "const k = 'log';\n";
    expect(usages(`${key}let f = console[k];\n${fallback}`)).toEqual(
      usages(`${key}const f = console[k] || console.error;`),
    );
    expect(usages(`${key}let f = console[k];\n${fallback}`)).toContain('api console.log [guarded]');
  });

  it.each([
    ['no fallback', "let f = console.log;\nif (typeof f !== 'function') g();"],
    ['an else branch', 'let f = console.log;\nif (!f) f = console.error; else g();'],
    ['a statement between', `let f = console.log;\ng();\n${fallback}`],
    ['a test of another name', 'let f = console.log;\nif (!g) f = console.error;'],
    ['a test with === null', 'let f = console.log;\nif (f === null) f = console.error;'],
    ['another declarator', `let f = console.log, g = f();\n${fallback}`],
    ['the opposite test', "let f = console.log;\nif (typeof f === 'function') f = console.error;"],
  ])('does not guard the read with %s', (_name, code) => {
    expect(usages(code)).toContain('api console.log');
  });
});

describe('the fallback of a console method in a function with known calls', () => {
  it('finds the keys of the real snippet of @opentelemetry/api', () => {
    const code = `const map = [{ n: 'error', c: 'error' }, { n: 'verbose', c: 'trace' }];
class Logger {
  constructor() {
    function consoleFunc(funcName) {
      return function (...args) {
        let theFunc = other[funcName];
        if (typeof theFunc !== 'function') {
          theFunc = console[funcName];
          if (typeof theFunc !== 'function') {
            theFunc = console.log;
          }
        }
      };
    }
    for (let i = 0; i < map.length; i++) {
      this[map[i].n] = consoleFunc(map[i].c);
    }
  }
}`;
    const found = usagesOf(code, 'src/input.ts', new Set(['console']));
    expect(found.filter(usage => usage.startsWith('dynamic'))).toEqual([]);
    expect(found).toContain('api console.trace');
  });
});
