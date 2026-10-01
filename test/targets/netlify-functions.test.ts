import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { functionFile, listFunctions } from '@/targets/netlify/functions.ts';
import { fixture } from '~/helpers.ts';

/** The order @netlify/edge-bundler 16.1.1 finds functions in (dist/node/finder.js). */
const directory = path.join(fixture('netlify-functions-order'), 'functions');
const names = (files: string[]): string[] =>
  files.map(file => path.relative(directory, file)).toSorted();

describe('Netlify edge functions in a directory', () => {
  it('keeps one top-level file for each name, the one with the lowest extension', () => {
    expect(names(listFunctions(directory))).toContain('a.js');
    expect(names(listFunctions(directory))).not.toContain('a.ts');
  });

  it('takes name/name.ext before name/index.ext', () => {
    expect(names(listFunctions(directory))).toContain(path.join('c', 'c.js'));
    expect(names(listFunctions(directory))).not.toContain(path.join('c', 'index.js'));
  });

  it('tries the extensions in turn inside a folder: index.mjs beats index.ts', () => {
    expect(names(listFunctions(directory))).toContain(path.join('e', 'index.mjs'));
  });

  it('lets a folder beat a file of the same name, and ignores files that are not functions', () => {
    expect(names(listFunctions(directory))).toEqual([
      'a.js',
      path.join('c', 'c.js'),
      path.join('d', 'index.ts'),
      path.join('e', 'index.mjs'),
    ]);
  });

  it('finds a declared function by name with the same order', () => {
    expect(path.relative(directory, functionFile(directory, 'a') ?? '')).toBe('a.js');
    expect(path.relative(directory, functionFile(directory, 'c') ?? '')).toBe(
      path.join('c', 'c.js'),
    );
    expect(path.relative(directory, functionFile(directory, 'd') ?? '')).toBe(
      path.join('d', 'index.ts'),
    );
    expect(functionFile(directory, 'missing')).toBeUndefined();
  });
});
