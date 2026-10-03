import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const wrapper = 'function load(name) {\n  return import(name);\n}\n';
const unknown = ['dynamic import(<expression>)'];

describe('a function that only imports its argument', () => {
  it('reads a call with a literal as an import of it', () => {
    const direct = usagesOf("await import('node:fs/promises');");
    expect(direct).toContain('api node:fs/promises');
    expect(usagesOf(`${wrapper}await load('node:fs/promises');`)).toEqual(direct);
  });

  it('binds a name that holds the result of a call, so its members count', () => {
    const usages = usagesOf(`${wrapper}const fs = await load('node:fs/promises');\nfs.stat('x');`);
    expect(usages).toContain('api node:fs/promises.stat');
    expect(usages.filter(usage => usage.startsWith('dynamic'))).toEqual([]);
  });

  it('reads the calls that are not awaited as an import that nothing catches', () => {
    expect(usagesOf(`${wrapper}await Promise.all([load('node:vm'), load('node:fs')]);`)).toEqual(
      usagesOf("await Promise.all([import('node:vm'), import('node:fs')]);"),
    );
  });

  it('reads an arrow function and a function expression the same way', () => {
    const direct = usagesOf("await import('node:vm');");
    expect(usagesOf("const load = s => import(s);\nawait load('node:vm');")).toEqual(direct);
    expect(
      usagesOf("const load = function (s) { return import(s); };\nawait load('node:vm');"),
    ).toEqual(direct);
  });

  it('keeps reporting a call with a name that is not a literal', () => {
    expect(usagesOf(`${wrapper}await load(name);`)).toEqual(unknown);
    expect(usagesOf(`${wrapper}await load('node:vm');\nawait load(name);`)).toEqual(unknown);
  });

  it.each([
    [
      'two parameters',
      "function load(name, other) {\n  return import(name);\n}\nawait load('node:vm');",
    ],
    [
      'another statement',
      "function load(name) {\n  log(name);\n  return import(name);\n}\nawait load('node:vm');",
    ],
    ['a function that is never called', wrapper],
    ['an export', `export ${wrapper}`],
    ['a function that is passed on', `${wrapper}use(load);\nawait load('node:vm');`],
  ])('keeps reporting %s', (_name, source) => {
    expect(usagesOf(source)).toEqual(unknown);
  });
});
