import { describe, expect, it } from 'vite-plus/test';

import { findAssignedOptions } from '@/extract/assigned.ts';
import { parse } from '@/extract/index.ts';
import { globalsOf, usagesOf } from '~/helpers.ts';

const fs = "import fs from 'node:fs';\n";
const watch = (...tags: string[]): string[] => [
  'api node:fs',
  `api node:fs.watch${tags.map(tag => ` [${tag}]`).join('')}`,
];
const globalWatch = (...tags: string[]): string[] => [
  'node:fs',
  `node:fs.watch${tags.map(tag => ` [${tag}]`).join('')}`,
];

describe('a minified typeof check', () => {
  it.each([
    ['typeof x < "u"', `if (typeof fs.watch < "u") fs.watch('.');`],
    ['"u" > typeof x', `if ("u" > typeof fs.watch) fs.watch('.');`],
    ['typeof x > "u" in the else branch', `typeof fs.watch > "u" ? noop() : fs.watch('.');`],
    ['"u" < typeof x in the else branch', `"u" < typeof fs.watch ? noop() : fs.watch('.');`],
    ['a guard clause', `if (typeof fs.watch > "u") throw new Error('x');\nfs.watch('.');`],
  ])('guards an API behind %s', (_label, code) => {
    expect(usagesOf(`${fs}${code}`)).toEqual(watch('guarded'));
  });

  it('knows a global behind each form', () => {
    expect(globalsOf(`${fs}if (typeof FileList < "u") fs.watch('.');`)).toEqual(
      globalWatch('has FileList'),
    );
    expect(globalsOf(`${fs}if ("u" > typeof FileList) fs.watch('.');`)).toEqual(
      globalWatch('has FileList'),
    );
    expect(globalsOf(`${fs}if (typeof FileList > "u") fs.watch('.');`)).toEqual(
      globalWatch('no FileList'),
    );
    expect(globalsOf(`${fs}if ("u" < typeof FileList) fs.watch('.');`)).toEqual(
      globalWatch('no FileList'),
    );
  });

  it.each([
    [
      'typeof globalThis.Deno > "u" ? 0 : globalThis.Deno.version',
      "typeof globalThis.Deno === 'undefined' ? 0 : globalThis.Deno.version",
    ],
    ['"u" > typeof Deno && Deno.version', "typeof Deno !== 'undefined' && Deno.version"],
    ['typeof EdgeRuntime < "u" && fs.watch()', "typeof EdgeRuntime !== 'undefined' && fs.watch()"],
  ])('reads %s as its long form', (minified, long) => {
    const deno = new Set(['Deno', 'globalThis']);
    expect(usagesOf(`${fs}export const v = ${minified};`, 'src/input.ts', deno)).toEqual(
      usagesOf(`${fs}export const v = ${long};`, 'src/input.ts', deno),
    );
  });

  it('knows the runtime behind each form, also in a const', () => {
    expect(usagesOf(`${fs}if (typeof Deno < "u") fs.watch('.');`)).toEqual(watch('deno'));
    expect(usagesOf(`${fs}if (typeof Bun > "u") fs.watch('.');`)).toEqual(watch('not bun'));
    expect(usagesOf(`${fs}if ("u" > typeof Deno) fs.watch('.');`)).toEqual(watch('deno'));
    expect(usagesOf(`${fs}if ("u" < typeof Bun) fs.watch('.');`)).toEqual(watch('not bun'));
    expect(usagesOf(`${fs}const isBun = typeof Bun < "u";\nif (isBun) fs.watch('.');`)).toEqual(
      watch('bun'),
    );
  });
});

describe('a compare that is not the minified typeof check', () => {
  it.each([
    'typeof fs.watch > "v"',
    'typeof fs.watch >= "u"',
    'typeof fs.watch <= "u"',
    '"u" >= typeof fs.watch',
    'typeof fs.watch < "undefined"',
    'typeof fs.watch > "undefined"',
    'typeof fs.watch < "U"',
    'typeof fs.watch < `u`',
    '-typeof fs.watch > "u"',
  ])('keeps the result of code with no check: %s', test => {
    expect(usagesOf(`${fs}if (${test}) fs.watch('.');`)).toEqual(watch());
    expect(usagesOf(`${fs}if (${test}) noop(); else fs.watch('.');`)).toEqual(watch());
  });

  it('keeps a plain value compared with "u" a use', () => {
    expect(usagesOf(`${fs}if (fs.watch > "u") fs.watch('.');`)).toEqual([
      'api node:fs',
      'api node:fs.watch',
      'api node:fs.watch',
    ]);
  });

  it.each(['typeof Deno >= "u"', 'typeof Deno < "U"', '"u" <= typeof Deno'])(
    'gives no runtime for %s',
    test => {
      expect(usagesOf(`${fs}if (${test}) fs.watch('.');`)).toEqual(watch());
    },
  );
});

describe('a minified typeof check in a fallback or an option test', () => {
  const console = new Set(['console']);
  const usages = (source: string): string[] => usagesOf(source, 'src/input.ts', console);
  const optionsOf = (source: string): string[] =>
    findAssignedOptions(parse('lib/input.js', source).program.body as never);

  it.each([
    ['typeof f > "u"', 'let f = console.log;\nif (typeof f > "u") f = console.error;'],
    ['"u" < typeof f', 'let f = console.log;\nif ("u" < typeof f) f = console.error;'],
  ])('guards the read before a fallback with %s', (_label, code) => {
    expect(usages(code)).toEqual(['api console.log [guarded]', 'api console.error']);
  });

  it.each([
    ['the opposite test', 'let f = console.log;\nif (typeof f < "u") f = console.error;'],
    ['another compare', 'let f = console.log;\nif (typeof f >= "u") f = console.error;'],
  ])('does not guard the read with %s', (_label, code) => {
    expect(usages(code)).toContain('api console.log');
  });

  it('does not count an option set under a test that the member is there', () => {
    expect(optionsOf('if (typeof data.http2 < "u") { data.http2 = coerced; }')).toEqual([]);
    expect(optionsOf('if ("u" > typeof data.http2) { data.http2 = coerced; }')).toEqual([]);
    expect(optionsOf('if (typeof data.http2 > "u") { data.http2 = 1; }')).toEqual(['http2']);
    expect(optionsOf('if (typeof data.http2 <= "u") { data.http2 = 1; }')).toEqual(['http2']);
  });
});
