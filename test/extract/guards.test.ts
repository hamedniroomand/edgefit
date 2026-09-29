import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const fs = "import fs from 'node:fs';\n";
const guardedWatch = ['api node:fs', 'api node:fs.watch [guarded]'];
const plainWatch = ['api node:fs', 'api node:fs.watch'];

describe('usages guarded by an API check', () => {
  it('guards the branch of an if that tests for the API', () => {
    expect(usagesOf(`${fs}if (fs.watch) {\n  fs.watch('.');\n}`)).toEqual(guardedWatch);
    expect(usagesOf(`${fs}if (typeof fs.watch === 'function') fs.watch('.');`)).toEqual(
      guardedWatch,
    );
    expect(usagesOf(`${fs}if (typeof fs.watch !== 'undefined') fs.watch('.');`)).toEqual(
      guardedWatch,
    );
    expect(usagesOf(`${fs}if ('watch' in fs) fs.watch('.');`)).toEqual(guardedWatch);
    expect(usagesOf(`${fs}if (fs.watch !== undefined) fs.watch('.');`)).toEqual(guardedWatch);
  });

  it('guards the else branch of a negative check', () => {
    expect(usagesOf(`${fs}if (!fs.watch) {\n  noop();\n} else {\n  fs.watch('.');\n}`)).toEqual(
      guardedWatch,
    );
    expect(
      usagesOf(`${fs}if (typeof fs.watch === 'undefined') noop(); else fs.watch('.');`),
    ).toEqual(guardedWatch);
  });
});

describe('usages guarded by a check on the other side', () => {
  it('guards the other side of &&, || and ?:', () => {
    expect(usagesOf(`${fs}fs.watch && fs.watch('.');`)).toEqual(guardedWatch);
    expect(usagesOf(`${fs}!fs.watch || fs.watch('.');`)).toEqual(guardedWatch);
    expect(usagesOf(`${fs}const stop = fs.watch ? fs.watch('.') : null;`)).toEqual(guardedWatch);
    expect(
      usagesOf(`${fs}const stop = typeof fs.watch == 'undefined' ? null : fs.watch('.');`),
    ).toEqual(guardedWatch);
  });

  it('guards an optional call on the API', () => {
    expect(usagesOf(`${fs}fs.watch?.('.');`)).toEqual(guardedWatch);
  });
});

describe('usages guarded through clauses and names', () => {
  it('guards the rest of the block after a guard clause', () => {
    expect(usagesOf(`${fs}if (!fs.watch) throw new Error('no watch');\nfs.watch('.');`)).toEqual(
      guardedWatch,
    );
    expect(
      usagesOf(
        `${fs}function run() {\n  if (typeof fs.watch != 'function') {\n    return;\n  }\n  fs.watch('.');\n}`,
      ),
    ).toEqual(guardedWatch);
    expect(
      usagesOf(`${fs}for (const dir of dirs) {\n  if (!fs.watch) continue;\n  fs.watch(dir);\n}`),
    ).toEqual(guardedWatch);
  });

  it('follows aliases and members below the guarded API', () => {
    expect(usagesOf(`${fs}const w = fs;\nif (w.watch) w.watch('.');`)).toEqual([
      'api node:fs',
      'api node:fs',
      'api node:fs.watch [guarded]',
    ]);
    expect(usagesOf(`${fs}if (fs.promises) fs.promises.watch('.');`)).toEqual([
      'api node:fs',
      'api node:fs.promises.watch [guarded]',
    ]);
  });

  it('understands the jose check on crypto.subtle', () => {
    const source =
      "const subtle = crypto.subtle;\nif (typeof subtle.getPublicKey != 'function') {\n  throw new TypeError('not extractable');\n}\nconst key = await subtle.getPublicKey(pair, []);";
    expect(usagesOf(source, 'src/input.ts', new Set(['crypto']))).toEqual([
      'api crypto.subtle',
      'api crypto.subtle.getPublicKey [guarded]',
    ]);
  });

  it('does not count the check itself as a use', () => {
    expect(usagesOf(`${fs}if (fs.watch) {\n  noop();\n}`)).toEqual(['api node:fs']);
    expect(usagesOf(`${fs}const has = !!fs.watch;`)).toEqual(['api node:fs']);
  });
});

describe('usages the check does not protect', () => {
  it('keeps a check on a different API from guarding', () => {
    expect(usagesOf(`${fs}if (fs.watchFile) fs.watch('.');`)).toEqual(plainWatch);
    expect(usagesOf(`${fs}if (!fs.watchFile) throw new Error();\nfs.watch('.');`)).toEqual(
      plainWatch,
    );
  });

  it('keeps the branch that runs when the API is missing', () => {
    expect(usagesOf(`${fs}if (fs.watch) {\n  noop();\n} else {\n  fs.watch('.');\n}`)).toEqual(
      plainWatch,
    );
    expect(usagesOf(`${fs}fs.watch || fs.watch('.');`)).toEqual([
      'api node:fs',
      'api node:fs.watch',
      'api node:fs.watch',
    ]);
  });

  it('keeps code after a check that does not stop the flow', () => {
    expect(usagesOf(`${fs}if (!fs.watch) {\n  warn();\n}\nfs.watch('.');`)).toEqual(plainWatch);
  });

  it('ends the guard with its block', () => {
    expect(usagesOf(`${fs}if (fs.watch) {\n  fs.watch('.');\n}\nfs.watch('..');`)).toEqual([
      'api node:fs',
      'api node:fs.watch [guarded]',
      'api node:fs.watch',
    ]);
  });

  it('drops a guard on an alias that is reassigned', () => {
    expect(usagesOf(`${fs}let w = fs;\nif (w.watch) {\n  w = other;\n  w.watch('.');\n}`)).toEqual([
      'api node:fs',
      'api node:fs',
      'api node:fs.watch',
    ]);
  });
});

describe('uses that only look like checks', () => {
  it('keeps the left side of || and ?? as a use of the API', () => {
    expect(usagesOf(`${fs}const watch = fs.watch || polyfill;`)).toEqual(plainWatch);
    expect(usagesOf(`${fs}const watch = fs.watch ?? polyfill;`)).toEqual(plainWatch);
  });

  it('keeps a comparison with a value as a use', () => {
    expect(usagesOf(`${fs}const same = fs.watch === other;`)).toEqual(plainWatch);
  });
});

describe('a check on a different API', () => {
  it('does not guard through &&, ?:, in, typeof or ?.()', () => {
    expect(usagesOf(`${fs}fs.watchFile && fs.watch('.');`)).toEqual(plainWatch);
    expect(usagesOf(`${fs}const stop = fs.watchFile ? fs.watch('.') : null;`)).toEqual(plainWatch);
    expect(usagesOf(`${fs}if ('watchFile' in fs) fs.watch('.');`)).toEqual(plainWatch);
    expect(usagesOf(`${fs}if (typeof fs.watchFile === 'function') fs.watch('.');`)).toEqual(
      plainWatch,
    );
    expect(usagesOf(`${fs}fs.watchFile?.('.');\nfs.watch('.');`)).toEqual([
      'api node:fs',
      'api node:fs.watchFile [guarded]',
      'api node:fs.watch',
    ]);
  });
});
