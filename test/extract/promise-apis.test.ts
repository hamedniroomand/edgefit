import { describe, expect, it } from 'vite-plus/test';

import { isPromiseApi } from '@/extract/promise-apis.ts';

describe('an API that gives a promise', () => {
  it.each([
    ['a promises module', 'fs/promises', ['readFile']],
    ['a promises path', 'fs', ['promises', 'readFile']],
    ['crypto.subtle', '*globals*', ['crypto', 'subtle', 'digest']],
    ['WebAssembly.compile', '*globals*', ['WebAssembly', 'compile']],
    ['fetch', '*globals*', ['fetch']],
    ['fs.openAsBlob', 'fs', ['openAsBlob']],
    ['events.once', 'events', ['once']],
  ])('counts %s', (_name, module, path) => {
    expect(isPromiseApi({ module, path })).toBe(true);
  });

  it.each([
    ['a sync function', 'fs', ['watch']],
    ['a method of the same name on another module', 'process', ['once']],
    ['a member of a promise function', '*globals*', ['fetch', 'length']],
    [
      'the bytes leaf of WebAssembly.instantiate',
      '*globals*',
      ['WebAssembly', 'instantiate', '(bytes)'],
    ],
    ['a key that holds a dot', '*globals*', ['WebAssembly.compile']],
  ])('does not count %s', (_name, module, path) => {
    expect(isPromiseApi({ module, path })).toBe(false);
  });
});
