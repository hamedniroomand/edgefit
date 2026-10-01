import { summarizeDisagreements } from '@scripts/probe/disagreements.mjs';
import { describe, expect, it } from 'vite-plus/test';

const gone = (api: string): { api: string; message: string; dataSaysPresent: boolean } => ({
  api,
  message: 'matrix says `present`, probe says `missing`',
  dataSaysPresent: true,
});
const extra = (api: string): { api: string; message: string; dataSaysPresent: boolean } => ({
  api,
  message: 'matrix says `missing`, probe says `implemented`',
  dataSaysPresent: false,
});

const lines = (...args: Parameters<typeof summarizeDisagreements>): string =>
  summarizeDisagreements(...args).join('\n');
// What a reader sees: the full list is folded away after it.
const visible = (text: string): string => text.split('<details>')[0] ?? '';
const listed = (text: string, api: string): boolean => text.includes(`- \`${api}\`: `);

describe('summarizeDisagreements', () => {
  it('drops a default mirror and a sys alias that repeat another line', () => {
    const text = lines(
      [
        gone('fs.openAsBlob'),
        gone('fs.default.openAsBlob'),
        gone('util.parseEnv'),
        gone('sys.parseEnv'),
      ],
      {},
    );
    expect(visible(text)).toContain('`fs` (1): openAsBlob');
    expect(visible(text)).toContain('`util` (1): parseEnv');
    expect(visible(text)).not.toContain('default');
    expect(visible(text)).not.toContain('sys');
  });

  it('keeps an alias whose result differs', () => {
    const text = lines([gone('util.parseEnv'), extra('sys.parseEnv')], {});
    expect(listed(text, 'sys.parseEnv')).toBe(true);
  });

  it('folds the nested aliases of path into one line', () => {
    const text = lines(
      [
        gone('path/posix.win32.win32.matchesGlob'),
        gone('path.posix.posix.matchesGlob'),
        gone('path.matchesGlob'),
      ],
      {},
    );
    expect(text).toContain('`path` (1): matchesGlob');
    expect(visible(text)).not.toContain('posix');
  });

  it('keeps one line for aliases when the plain path is not listed', () => {
    const text = lines(
      [gone('path.posix.posix.matchesGlob'), gone('path/posix.posix.matchesGlob')],
      {},
    );
    expect(text).toContain('`path` (1): posix.matchesGlob');
  });
});

describe('summarizeDisagreements sections', () => {
  it('puts the possible false passes first, then what the data lacks', () => {
    const text = lines([extra('fs.F_OK'), gone('zlib.ZstdCompress')], {});
    const missing = text.indexOf('missing at runtime (possible false passes) (1)');
    const present = text.indexOf('Unusable in the data, present at runtime (1)');
    expect(missing).toBeGreaterThan(-1);
    expect(present).toBeGreaterThan(missing);
    expect(text.slice(missing, present)).toContain('zlib');
    expect(text.slice(present)).toContain('fs');
  });

  it('groups by module with a count and folds the full list away', () => {
    const apis = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(name => gone(`zlib.${name}`));
    const text = lines(apis, {});
    expect(text).toContain('`zlib` (7): a, b, c, d, e, f, …');
    expect(text).toContain('<details><summary>Full list</summary>');
    expect(listed(text, 'zlib.g')).toBe(true);
  });

  it('separates a named export the module lacks but its default export has', () => {
    const text = lines([gone('stream.promises.pipeline'), gone('stream/consumers.bytes')], {
      'stream.default.promises.pipeline': 'present',
      'stream/consumers.default.bytes': 'missing',
    });
    const named = text.indexOf('Missing as a named export only');
    expect(named).toBeGreaterThan(text.indexOf('(possible false passes)'));
    expect(text.slice(named)).toContain('`stream` (1): promises.pipeline');
    expect(text.slice(0, named)).toContain('`stream/consumers` (1): bytes');
  });

  it('keeps the names as the probe wrote them in the full list', () => {
    const text = lines([gone('fs.openAsBlob'), gone('fs.default.openAsBlob')], {});
    expect(listed(text, 'fs.default.openAsBlob')).toBe(true);
    expect(text).toContain('`fs` (1): openAsBlob');
  });

  it('only folds repeats of a known alias', () => {
    const text = lines([gone('a.b.b.c')], {});
    expect(text).toContain('`a` (1): b.b.c');
  });

  it('says nothing when the probe agrees', () => {
    expect(summarizeDisagreements([], {})).toEqual([]);
  });
});
