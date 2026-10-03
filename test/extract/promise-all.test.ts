import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const wrapper = 'const load = specifier => import(specifier);\n';
const named = ['api node:fs/promises.stat', 'api node:vm.runInContext'];

describe('names that Promise.all gives by position', () => {
  it('binds each name to the module at its position and counts its members', () => {
    const usages = usagesOf(
      "const [fs, vm] = await Promise.all([import('node:fs/promises'), import('node:vm')]);\nfs.stat('x');\nvm.runInContext('y');",
    );
    expect(usages).toEqual(expect.arrayContaining(named));
    expect(usages.filter(usage => usage.startsWith('dynamic'))).toEqual([]);
  });

  it('binds a module that a wrapper of import() gives', () => {
    const usages = usagesOf(
      `${wrapper}const [fs, other] = await Promise.all([load('node:fs/promises'), load('strtok3')]);\nfs.stat('x');`,
    );
    expect(usages).toContain('api node:fs/promises.stat');
    expect(usages.filter(usage => usage.startsWith('dynamic node:'))).toEqual([]);
  });
});

describe('patterns and elements that Promise.all gives', () => {
  it('binds an object pattern that takes the default export of a module', () => {
    const usages = usagesOf(
      "const [{ default: fs }, { Tokenizer }] = await Promise.all([import('node:fs/promises'), import('strtok3')]);\nfs.open('x');",
    );
    expect(usages).toContain('api node:fs/promises.open');
    expect(usages.filter(usage => usage.startsWith('dynamic'))).toEqual([]);
  });

  it('leaves the name of an element that is a plain call unbound', () => {
    const usages = usagesOf(
      "const [data, vm] = await Promise.all([read(), import('node:vm')]);\ndata.x();\nvm.runInContext('y');",
    );
    expect(usages).toContain('api node:vm.runInContext');
    expect(usages).not.toContain('dynamic node:vm');
  });

  it.each([
    [
      'a spread before the module',
      "const [a, b] = await Promise.all([...more, import('node:vm')]);\nb.runInContext();",
    ],
    [
      'a rest element',
      "const [...all] = await Promise.all([import('node:vm')]);\nall[0].runInContext();",
    ],
    [
      'a hole in the list',
      "const [a, b] = await Promise.all([, import('node:vm')]);\nb.runInContext();",
    ],
    [
      'a variable in the list',
      "const list = [import('node:vm')];\nconst [a] = await Promise.all(list);\na.runInContext();",
    ],
  ])('keeps the escape for %s', (_name, code) => {
    expect(usagesOf(code)).not.toContain('api node:vm.runInContext');
  });
});
