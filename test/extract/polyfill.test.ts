import { describe, expect, it } from 'vite-plus/test';

import { extractUsages } from '@/extract/index.ts';
import { usagesOf } from '~/helpers.ts';

const crypto = "import crypto from 'node:crypto';\n";
const stored = [
  'api node:crypto',
  'api node:crypto [polyfill crypto]',
  'dynamic node:crypto [polyfill crypto]',
];
const plain = ['api node:crypto', 'api node:crypto', 'dynamic node:crypto'];

describe('a module stored in a global that is only set when it is missing', () => {
  it('marks the value of ??= and ||=', () => {
    expect(usagesOf(`${crypto}globalThis.crypto ??= crypto as never;`)).toEqual(stored);
    expect(usagesOf(`${crypto}globalThis.crypto ||= crypto as never;`)).toEqual(stored);
  });

  it('marks the value of a plain assignment that a missing check guards', () => {
    expect(usagesOf(`${crypto}if (!globalThis.crypto) globalThis.crypto = crypto;`)).toEqual(
      stored,
    );
    expect(usagesOf(`${crypto}globalThis.crypto || (globalThis.crypto = crypto);`)).toEqual([
      'api node:crypto',
      'api crypto [guarded]',
      ...stored.slice(1),
    ]);
    expect(
      usagesOf(`${crypto}if (typeof self.crypto === 'undefined') self.crypto = crypto;`),
    ).toEqual(stored);
  });

  it('does not mark an unconditional assignment', () => {
    expect(usagesOf(`${crypto}globalThis.crypto = crypto;`)).toEqual(plain);
  });

  it('does not mark a check on another global', () => {
    expect(usagesOf(`${crypto}if (!globalThis.other) globalThis.crypto = crypto;`)).toEqual(plain);
  });

  it('does not mark a value that is stored somewhere else in the branch', () => {
    expect(
      usagesOf(`${crypto}if (!globalThis.crypto) {\n  globalThis.crypto = 1;\n  keep(crypto);\n}`),
    ).toEqual(plain);
  });
});

describe('other usages in the value of a store', () => {
  it('marks a native addon', () => {
    const usages = extractUsages('lib.cjs', "globalThis.fetch ??= require('./addon.node');", {
      globals: new Set(['globalThis', 'fetch']),
      nodeEnv: undefined,
      nativeSpecifiers: new Map([['./addon.node', 'addon']]),
    });
    expect(usages.find(usage => usage.kind === 'native')?.polyfill).toEqual({
      module: '*globals*',
      path: ['fetch'],
    });
  });

  it('marks the value of a store to process, which is a module ref', () => {
    expect(usagesOf(`${crypto}globalThis.process ??= crypto.randomUUID();`)).toContain(
      'api node:crypto.randomUUID [polyfill process]',
    );
  });

  it('marks a store through a const alias of the global object', () => {
    expect(usagesOf(`${crypto}const g = globalThis;\ng.crypto ??= crypto;`)).toContain(
      'dynamic node:crypto [polyfill crypto]',
    );
  });

  it('does not mark a store through a let alias, which the code can write again', () => {
    expect(usagesOf(`${crypto}let g = globalThis;\ng.crypto ??= crypto;`)).toContain(
      'dynamic node:crypto',
    );
  });
});
