import { describe, expect, it } from 'vite-plus/test';

import { extractUsages } from '@/extract/index.ts';
import type { PassedKey } from '@/types.ts';

const tls = "const tls = require('node:tls');\n";

/** The keys that each `node:tls` member usage passes, in source order. */
function passed(source: string, file = 'src/input.js'): (PassedKey[] | undefined)[] {
  return extractUsages(file, source, { globals: new Set(), nodeEnv: 'production' })
    .filter(usage => usage.display.startsWith('node:tls.'))
    .map(usage => usage.passedKeys);
}

describe('the keys that a call passes', () => {
  it('reads a literal key', () => {
    expect(passed(`${tls}tls.connect({ ALPNProtocols: ['h2'] });`)).toEqual([
      [{ key: 'ALPNProtocols' }],
    ]);
  });

  it('reads the keys of a local const that holds an object literal', () => {
    const source = `${tls}const options = { ALPNProtocols: ['h2'], host: 'a' };\ntls.connect(options);`;
    expect(passed(source)).toEqual([[{ key: 'ALPNProtocols' }, { key: 'host', value: 'a' }]]);
  });

  it('reads a const inside a function', () => {
    const source = `${tls}function open(host) {\n  const options = { ALPNProtocols: ['h2'], host };\n  return tls.connect(options);\n}\nopen(name);`;
    expect(passed(source)).toEqual([[{ key: 'ALPNProtocols' }]]);
  });

  it('reads every argument, such as the third one', () => {
    const source = `${tls}const options = { checkServerIdentity() {} };\ntls.connect(443, 'a', options);`;
    expect(passed(source)).toEqual([[{ key: 'checkServerIdentity' }]]);
  });

  it('reads the keys of a `new` call', () => {
    expect(passed(`${tls}new tls.TLSSocket(socket, { ALPNProtocols: [] });`)).toEqual([
      [{ key: 'ALPNProtocols' }],
    ]);
  });

  it('reads a call through `(0, member)` and an optional call', () => {
    const source = `${tls}(0, tls.connect)({ ALPNProtocols: [] });\ntls.connect?.({ pskCallback() {} });`;
    expect(passed(source)).toEqual([[{ key: 'ALPNProtocols' }], [{ key: 'pskCallback' }]]);
  });
});

describe('a call whose keys are not known', () => {
  it.each([
    ['a spread only', `${tls}tls.connect({ ...options });`],
    [
      'a variable with unknown keys',
      `${tls}function open(options) { return tls.connect(options); }`,
    ],
    ['a call with no options', `${tls}tls.connect();`],
    ['a spread argument', `${tls}tls.connect(...args);`],
    ['a reference that is not a call', `${tls}if (socket instanceof tls.TLSSocket) {}`],
  ])('gives no keys for %s', (_name, source) => {
    expect(passed(source)).toEqual([undefined]);
  });

  it('keeps a key next to a spread', () => {
    expect(passed(`${tls}tls.connect({ ...options, ALPNProtocols: [] });`)).toEqual([
      [{ key: 'ALPNProtocols' }],
    ]);
  });
});

describe('the literal value of a key', () => {
  it.each([
    ['false', 'rejectUnauthorized: false', [{ key: 'rejectUnauthorized', value: false }]],
    ['true', 'rejectUnauthorized: true', [{ key: 'rejectUnauthorized', value: true }]],
    ['a number', 'minDHSize: 1024', [{ key: 'minDHSize', value: 1024 }]],
  ])('reads %s', (_name, property, keys) => {
    expect(passed(`${tls}tls.connect({ ${property} });`)).toEqual([keys]);
  });

  it('forgets a value that a later spread may replace', () => {
    expect(passed(`${tls}tls.connect({ rejectUnauthorized: false, ...options });`)).toEqual([
      [{ key: 'rejectUnauthorized' }],
    ]);
  });
});

describe('the keys of a named import', () => {
  const imported = "import { connect } from 'node:tls';\n";
  const file = 'src/input.mjs';
  /** `line keys` of each tls usage, with `*` for a usage that counts only for options. */
  const calls = (source: string): string[] =>
    extractUsages(file, source, { globals: new Set(), nodeEnv: 'production' })
      .filter(usage => usage.display.startsWith('node:tls.'))
      .map(
        usage =>
          `${usage.location.line}${usage.onlyForOptions === true ? '*' : ''} ${(usage.passedKeys ?? []).map(passedKey => passedKey.key).join(',')}`,
      );

  it('records a call that passes keys at the call, and keeps the import as it is', () => {
    expect(calls(`${imported}connect({ ALPNProtocols: [] });`)).toEqual(['1 ', '2* ALPNProtocols']);
  });

  it('records each call apart', () => {
    const source = `${imported}connect({ host: 'a' });\nconnect({ ALPNProtocols: [] });`;
    expect(calls(source)).toEqual(['1 ', '2* host', '3* ALPNProtocols']);
  });

  it('records no call for a name that is only passed as a value, or a call with no known keys', () => {
    expect(calls(`${imported}register(connect);\nconnect(options);`)).toEqual(['1 ', '2 ']);
  });

  it('follows an alias', () => {
    const source = "import { connect as open } from 'node:tls';\nopen({ ALPNProtocols: [] });";
    expect(calls(source)).toEqual(['1 ', '2* ALPNProtocols']);
  });

  it('keeps the condition of the call on its usage', () => {
    const source = `${imported}if (typeof Deno !== 'undefined') {\n  connect({ ALPNProtocols: [] });\n}`;
    const call = extractUsages(file, source, { globals: new Set(), nodeEnv: 'production' }).find(
      usage => usage.onlyForOptions === true,
    );
    expect(call?.location.line).toBe(3);
    expect(call?.runtimes).toEqual([{ runtime: 'deno', present: true }]);
  });
});

describe('a value that says the key is not passed', () => {
  it.each(['undefined', 'void 0'])('drops a key with the value %s', value => {
    expect(passed(`${tls}tls.connect({ checkServerIdentity: ${value}, host: 'a' });`)).toEqual([
      [{ key: 'host', value: 'a' }],
    ]);
  });

  it('keeps a key with the value null', () => {
    expect(passed(`${tls}tls.connect({ checkServerIdentity: null });`)).toEqual([
      [{ key: 'checkServerIdentity' }],
    ]);
  });

  it.each([
    ['!1', false],
    ['!0', true],
  ])('reads %s as a minifier writes a boolean', (literal, value) => {
    expect(passed(`${tls}tls.connect({ rejectUnauthorized: ${literal} });`)).toEqual([
      [{ key: 'rejectUnauthorized', value }],
    ]);
  });

  it('reads no keys from an outer const that a parameter hides', () => {
    const source = `${tls}const options = { ALPNProtocols: [] };\nfunction open(options) {\n  return tls.connect(options);\n}`;
    expect(passed(source)).toEqual([undefined]);
  });
});

describe('calls whose keys edgefit does not read', () => {
  it.each([
    ['a call through .call', `${tls}tls.connect.call(tls, { ALPNProtocols: [] });`],
    ['a call through .apply', `${tls}tls.connect.apply(tls, [{ ALPNProtocols: [] }]);`],
    [
      'a super call',
      `${tls}class S extends tls.TLSSocket {\n  constructor(s) {\n    super(s, { ALPNProtocols: [] });\n  }\n}`,
    ],
  ])('reads no keys from %s', (_name, source) => {
    expect(passed(source).every(keys => keys === undefined)).toBe(true);
  });

  it('reads the keys of a call through a local copy of the member', () => {
    expect(passed(`${tls}const open = tls.connect;\nopen({ ALPNProtocols: [] });`)).toContainEqual([
      { key: 'ALPNProtocols' },
    ]);
  });
});
