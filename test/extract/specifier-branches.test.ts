import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const caught = (code: string): string => `try {\n  ${code}\n} catch {}`;
const computed = 'dynamic require(<expression>)';

describe('a caught require of a conditional of strings', () => {
  it('reads each string like a plain require', () => {
    const plain = [
      ...usagesOf(caught("require('node:dgram');")),
      ...usagesOf(caught("require('node:fs');")),
    ];
    expect(plain).toEqual(['api node:dgram [guarded]', 'api node:fs [guarded]']);
    expect(usagesOf(caught("require(flag ? 'node:dgram' : 'node:fs');"))).toEqual(plain);
  });

  it('reads a conditional that a const holds', () => {
    const source = `const name = flag ? 'node:dgram' : 'node:fs';\n${caught('require(name);')}`;
    expect(usagesOf(source)).toEqual(['api node:dgram [guarded]', 'api node:fs [guarded]']);
  });

  it('reads nested conditionals and a const string as a branch', () => {
    const source = `const fs = 'node:fs';\n${caught("require(a ? 'node:dgram' : b ? fs : 'node:vm');")}`;
    expect(usagesOf(source)).toEqual([
      'api node:dgram [guarded]',
      'api node:fs [guarded]',
      'api node:vm [guarded]',
    ]);
  });

  it('skips a branch that gives no value', () => {
    const expected = ['api node:dgram [guarded]'];
    expect(usagesOf(caught("require(flag ? 'node:dgram' : undefined);"))).toEqual(expected);
    expect(usagesOf(caught("require(flag ? null : 'node:dgram');"))).toEqual(expected);
    expect(usagesOf(caught("require(flag ? void 0 : 'node:dgram');"))).toEqual(expected);
  });

  it('records no usage for a name that is not a Node.js module', () => {
    expect(usagesOf(caught("require(flag ? 'hono/bun' : 'hono/deno');"))).toEqual([]);
  });
});

describe('a caught require that a runtime check decides', () => {
  it('limits each branch to the runtimes that its test allows', () => {
    const source = caught("require(typeof Bun !== 'undefined' ? 'node:dgram' : 'node:fs');");
    expect(usagesOf(source)).toEqual([
      'api node:dgram [guarded] [bun]',
      'api node:fs [guarded] [not bun]',
    ]);
  });

  it('applies the tests of a const that an outer scope declares', () => {
    const source = `const name = typeof Bun !== 'undefined' ? 'node:dgram' : 'node:fs';\nfunction load() {\n  ${caught('require(name);')}\n}`;
    expect(usagesOf(source)).toEqual([
      'api node:dgram [guarded] [bun]',
      'api node:fs [guarded] [not bun]',
    ]);
  });

  it('reads a name that a const holds and three runtime checks decide', () => {
    const source = `const isBun = typeof globalThis.Bun !== 'undefined';
const isDeno = typeof globalThis.Deno !== 'undefined';
const isCloudflare = globalThis.navigator?.userAgent === 'Cloudflare-Workers';
const specifier = isBun ? 'hono/bun' : isDeno ? 'hono/deno' : isCloudflare ? void 0 : 'node:dgram';
if (specifier) {
  ${caught('require(specifier);')}
}`;
    expect(usagesOf(source)).toEqual([
      'api node:dgram [guarded] [not bun] [not deno] [not workerd]',
    ]);
  });
});

describe('a require that stays computed', () => {
  it.each<[string, string]>([
    ['a variable as a branch', "require(flag ? 'node:fs' : other);"],
    ['a call as a branch', "require(flag ? 'node:fs' : load());"],
    ['a template with an expression as a branch', "require(flag ? 'node:fs' : `node:${name}`);"],
    ['a conditional with no string', 'require(flag ? undefined : null);'],
    ['a parameter that has the name of a const', 'require(name);'],
  ])('reads %s as computed', (_name, call) => {
    const source = `const name = flag ? 'node:dgram' : 'node:fs';\nfunction load(name) {\n  ${caught(call)}\n}`;
    expect(usagesOf(source)).toContain(computed);
  });

  it('does not follow a let, a var or a conditional that is nested too deep', () => {
    const choose = "flag ? 'node:dgram' : 'node:fs'";
    expect(usagesOf(`let name = ${choose};\n${caught('require(name);')}`)).toEqual([computed]);
    expect(usagesOf(`var name = ${choose};\n${caught('require(name);')}`)).toEqual([computed]);
    const deep = Array.from({ length: 10 }, () => 'a ? undefined : ').join('');
    expect(usagesOf(caught(`require(${deep}'node:fs');`))).toEqual([computed]);
  });

  it('stops at consts that name each other', () => {
    const source = `const a = flag ? b : 'node:fs';\nconst b = flag ? a : 'node:vm';\n${caught('require(a);')}`;
    expect(usagesOf(source)).toEqual([computed]);
  });

  it('keeps an uncaught call computed, as Vercel Edge fails on it', () => {
    expect(usagesOf("const name = flag ? 'node:dgram' : 'node:fs';\nrequire(name);")).toEqual([
      computed,
    ]);
    expect(
      usagesOf("function load() {\n  return require(flag ? 'node:dgram' : 'node:fs');\n}"),
    ).toEqual([computed]);
  });
});

describe('an awaited import of a conditional of strings', () => {
  const awaited = (code: string): string => `async function load() {\n  ${caught(code)}\n}`;

  it('reads each string like a plain import', () => {
    const plain = [
      ...usagesOf(awaited("await import('node:dgram');")),
      ...usagesOf(awaited("await import('node:fs');")),
    ];
    expect(plain).toEqual(['api node:dgram [guarded]', 'api node:fs [guarded]']);
    expect(usagesOf(awaited("await import(flag ? 'node:dgram' : 'node:fs');"))).toEqual(plain);
    expect(
      usagesOf(`const name = flag ? 'node:dgram' : 'node:fs';\n${awaited('await import(name);')}`),
    ).toEqual(plain);
  });

  it('keeps a call that nothing awaits, or that no catch stops, computed', () => {
    const computedImport = 'dynamic import(<expression>)';
    expect(usagesOf(awaited("import(flag ? 'node:dgram' : 'node:fs');"))).toEqual([computedImport]);
    expect(
      usagesOf("async function load() {\n  await import(flag ? 'node:dgram' : 'node:fs');\n}"),
    ).toEqual([computedImport]);
  });

  it('keeps a branch that is not a string computed', () => {
    expect(usagesOf(awaited("await import(flag ? 'node:fs' : other);"))).toEqual([
      'dynamic import(<expression>)',
    ]);
  });
});
