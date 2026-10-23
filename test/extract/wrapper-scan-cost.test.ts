import process from 'node:process';

import type { Node } from 'oxc-parser';
import { describe, expect, it } from 'vite-plus/test';

import { findImportWrappers } from '@/extract/import-wrappers.ts';
import { parse } from '@/extract/index.ts';

// A minified bundle repeats one short name many times and holds many functions and calls. Four
// times the size must take about four times the time. A scan that copies a list for each mention,
// or that searches all calls for each function, takes about sixteen times as long.
const growth = 10;
// A busy machine can take far longer than the default timeout for the same work.
const timeoutMs = 60_000;

const wrapper = 'function load(name) {\n  return import(name);\n}\n';

function scan(source: string): ReturnType<typeof findImportWrappers> {
  return findImportWrappers(parse('bundle.js', source).program.body as Node[]);
}

/** The best CPU time of three scans. A busy machine makes the scan wait, and the wait is not counted. */
function bestCpuMs(source: string): number {
  const { program } = parse('bundle.js', source);
  let best = Infinity;
  for (let run = 0; run < 3; run += 1) {
    const before = process.cpuUsage();
    findImportWrappers(program.body as Node[]);
    const used = process.cpuUsage(before);
    best = Math.min(best, (used.user + used.system) / 1000);
  }
  return best;
}

const mentionsOf = (count: number): string =>
  `const a = 1;\n${'a;\n'.repeat(count)}${wrapper}await load('node:fs');`;

const functionsOf = (count: number): string =>
  Array.from({ length: count }, (_unused, index) =>
    [
      `function w${index}(s) { return import(s); }`,
      `w${index}('m${index}');`,
      `const o${index} = { k: () => require('r${index}') };`,
      `o${index}.k();`,
    ].join('\n'),
  ).join('\n');

const loaderObjectsOf = (count: number): string =>
  Array.from(
    { length: count },
    (_unused, index) => `const o${index} = { k: () => require('r${index}') };\no${index}.k();`,
  ).join('\n');

describe('the scan for import wrappers: result', () => {
  const source = [
    "function followed(s) { return import(s); }\nfollowed('m1');",
    "function passedOn(s) { return import(s); }\npassedOn('m2');\nuse(passedOn);",
    "function twice(s) { return import(s); }\n{ function twice(s) { return import(s); } }\ntwice('m3');",
    "const loaders = { x: () => require('lx') };\nloaders.x();",
    "const passed = { y: () => require('ly') };\nuse(passed);\npassed.y();",
  ].join('\n');

  it('follows only the functions and objects that every mention accounts for', () => {
    const found = scan(source);
    expect([...found.calls.values()]).toEqual(['m1']);
    expect(found.imports.size).toBe(1);
    expect(
      [...found.loaderCalls.values()].map(loaders => loaders.map(item => item.specifier)),
    ).toEqual([['lx']]);
    expect(found.requires.size).toBe(1);
  });

  it('keeps a mention of a function among many mentions of other names', () => {
    const filler = 'a;\n'.repeat(1000);
    const found = scan(`${filler}${wrapper}await load('node:fs');\nuse(load);`);
    expect(found.calls.size).toBe(0);
    expect(scan(`${filler}${wrapper}await load('node:fs');`).calls.size).toBe(1);
  });

  it('follows every function, loader object and call of a file with many of them', () => {
    const found = scan(functionsOf(2000));
    expect(found.imports.size).toBe(2000);
    expect(found.calls.size).toBe(2000);
    expect(found.loaderCalls.size).toBe(2000);
  });
});

describe('the scan for import wrappers: cost', () => {
  it(
    'takes about four times as long for a file with four times the mentions of one name',
    () => {
      const small = bestCpuMs(mentionsOf(15_000));
      expect(bestCpuMs(mentionsOf(60_000)) / small).toBeLessThan(growth);
    },
    timeoutMs,
  );

  it(
    'takes about four times as long for a file with four times the functions and calls',
    () => {
      const small = bestCpuMs(functionsOf(5000));
      expect(bestCpuMs(functionsOf(20_000)) / small).toBeLessThan(growth);
    },
    timeoutMs,
  );

  it(
    'takes about four times as long for a file with four times the loader objects',
    () => {
      const small = bestCpuMs(loaderObjectsOf(10_000));
      expect(bestCpuMs(loaderObjectsOf(40_000)) / small).toBeLessThan(growth);
    },
    timeoutMs,
  );
});
