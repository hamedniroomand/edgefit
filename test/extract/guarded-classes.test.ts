import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const names = new Set(['globalThis', 'Deno', 'window']);
const usages = (code: string): string[] => usagesOf(code, 'src/input.ts', names);
const monitor = `class Monitor {
  constructor() { window.addEventListener('online', f); }
  stop() { window.removeEventListener('online', f); }
  get online() { return window.navigator; }
  handler = () => window.focus();
  static name = window.name;
  static { window.blur(); }
}`;
const guardedNew = "typeof window !== 'undefined' ? new Monitor() : null";

describe('a local class that only checked code makes', () => {
  it('gives the check to the code that runs for an instance', () => {
    expect(usages(`${monitor}\nexport const make = () => ${guardedNew};`)).toEqual([
      'api window.addEventListener [guarded]',
      'api window.removeEventListener [guarded]',
      'api window.navigator [guarded]',
      'api window.focus [guarded]',
      'api window.name',
      'api window.blur',
    ]);
  });

  it('applies to a class expression, and to the runtime of a helper check', () => {
    expect(
      usages(
        `function isDeno() { return typeof globalThis.Deno !== 'undefined'; }\nconst Info = class { version() { return globalThis.Deno.version; } };\nexport const version = () => (isDeno() ? new Info().version() : 'none');`,
      ),
    ).toEqual(['api Deno.version [guarded] [deno]']);
  });

  it('gives no check when one use has none, or when the file exports the class', () => {
    const unchecked = usages(
      `${monitor}\nexport const make = () => ${guardedNew};\nexport const other = () => new Monitor();`,
    );
    expect(unchecked).toContain('api window.addEventListener');
    expect(usages(`export ${monitor}\nexport const make = () => ${guardedNew};`)).toContain(
      'api window.addEventListener',
    );
    expect(
      usages(`${monitor}\nexport default Monitor;\nexport const make = () => ${guardedNew};`),
    ).toContain('api window.addEventListener');
  });

  it('gives no check when the file declares the name again', () => {
    expect(
      usages(
        `${monitor}\nfunction g(Monitor) { return Monitor; }\nexport const make = () => ${guardedNew};`,
      ),
    ).toContain('api window.addEventListener');
  });
});

describe('a local class that its own static code makes', () => {
  it('gives no check, because static code runs when the class is defined', () => {
    expect(
      usages(
        `class Single {\n  constructor() { window.addEventListener('x', f); }\n  static instance = new Single();\n}\nexport const make = () => (${"typeof window !== 'undefined' ? Single.instance : null"});`,
      ),
    ).toContain('api window.addEventListener');
  });

  it('keeps the check for a use in an instance method', () => {
    expect(
      usages(
        `class Node2 {\n  constructor() { window.addEventListener('x', f); }\n  clone() { return new Node2(); }\n}\nexport const make = () => (typeof window !== 'undefined' ? new Node2() : null);`,
      ),
    ).toEqual(['api window.addEventListener [guarded]']);
  });
});
