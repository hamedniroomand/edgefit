import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const crypto = "import crypto from 'node:crypto';\n";
const stored = ['api node:crypto', 'api node:crypto', 'dynamic node:crypto [polyfill crypto]'];
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
      'api crypto',
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
