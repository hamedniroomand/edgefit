import { describe, expect, it } from 'vite-plus/test';

import { globalsOf } from '~/helpers.ts';

const fs = "import fs from 'node:fs';\n";
const watch = (...tags: string[]): string[] => [
  'node:fs',
  `node:fs.watch${tags.map(tag => ` [${tag}]`).join('')}`,
];

describe('usages behind a check for a global', () => {
  it('knows the branch of typeof, a truth test and in', () => {
    expect(globalsOf(`${fs}if (typeof FileList !== 'undefined') fs.watch('.');`)).toEqual(
      watch('has FileList'),
    );
    expect(globalsOf(`${fs}if (globalThis.FileList) fs.watch('.');`)).toEqual(
      watch('has FileList'),
    );
    expect(globalsOf(`${fs}if ('FileList' in globalThis) fs.watch('.');`)).toEqual(
      watch('has FileList'),
    );
    expect(globalsOf(`${fs}if (global.crypto) fs.watch('.');`)).toEqual(watch('has crypto'));
  });

  it('knows the else branch and a failed check', () => {
    expect(globalsOf(`${fs}if (typeof FileList === 'undefined') fs.watch('.');`)).toEqual(
      watch('no FileList'),
    );
    expect(globalsOf(`${fs}if (!globalThis.FileList) noop(); else fs.watch('.');`)).toEqual(
      watch('has FileList'),
    );
    expect(globalsOf(`${fs}if (global && !global.crypto) fs.watch('.');`)).toEqual(
      watch('no crypto'),
    );
  });

  it('knows the code after a guard clause', () => {
    expect(
      globalsOf(
        `${fs}function run() {\n  if (!globalThis.FileList) throw new Error('x');\n  fs.watch('.');\n}`,
      ),
    ).toEqual(watch('has FileList'));
  });

  it('gives no condition for a local name, a global object or a runtime marker', () => {
    expect(globalsOf(`${fs}const FileList = 1;\nif (FileList) fs.watch('.');`)).toEqual(watch());
    expect(globalsOf(`${fs}if (globalThis) fs.watch('.');`)).toEqual(watch());
    expect(globalsOf(`${fs}if (typeof Deno !== 'undefined') fs.watch('.');`)).toEqual(watch());
  });
});
