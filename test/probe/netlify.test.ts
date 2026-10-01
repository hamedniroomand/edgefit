import {
  compareNetlify,
  extract,
  hashPages,
  minimumOf,
  parseDenoRange,
  watched,
} from '@scripts/probe/netlify/docs.mjs';
import { describe, expect, it } from 'vite-plus/test';

// The two lines of @netlify/edge-bundler's dist/node/bridge.js that name the ranges (16.1.1).
const bridge = `export const LEGACY_DENO_VERSION_RANGE = '1.39.0 - 2.2.4';
// When updating DENO_VERSION_RANGE, ensure that the deno version
export const DENO_VERSION_RANGE = '^2.4.2';
`;

describe('parseDenoRange', () => {
  it('reads the current range, not the legacy one that contains its name', () => {
    expect(parseDenoRange(bridge)).toEqual({ range: '^2.4.2', legacyRange: '1.39.0 - 2.2.4' });
  });

  it('finds nothing in a bundler that moved the constant', () => {
    expect(parseDenoRange('export const other = 1;').range).toBeUndefined();
  });

  it('takes the oldest version a range allows', () => {
    expect(minimumOf('^2.4.2')).toBe('2.4.2');
    expect(minimumOf('1.39.0 - 2.2.4')).toBe('1.39.0');
    expect(minimumOf()).toBeUndefined();
  });
});

describe('watched Netlify docs', () => {
  const api = `---\ntitle: API\n---\n\n## Other\n\nx\n\n### Runtime environment\n\nDeno text.\n\n### Import maps\n\nmaps\n\n## Supported web APIs\n\n- fetch\n`;
  const limitsPage = '---\ntitle: Limits\n---\n\nlimits text';
  const pages = { [watched.runtimeEnvironment.url]: api, [watched.limits.url]: limitsPage };

  it('extracts a section, or a page without its front matter', () => {
    expect(extract(api, '### Runtime environment')).toContain('Deno text.');
    expect(extract(api, '### Runtime environment')).not.toContain('maps');
    expect(extract(limitsPage).trim()).toBe('limits text');
  });

  it('hashes each part, and a change to one changes only its hash', () => {
    const before = hashPages(pages);
    const after = hashPages({ ...pages, [watched.limits.url]: 'limits changed' });
    expect(after.runtimeEnvironment).toBe(before.runtimeEnvironment);
    expect(after.limits).not.toBe(before.limits);
  });
});

describe('compareNetlify', () => {
  const recorded = {
    docs: { runtimeEnvironment: 'a', supportedWebApis: 'b', limits: 'c' },
    bundler: { denoRange: '^2.4.2' },
  };

  it('finds no drift when the pages and the range match', () => {
    const hashes = { runtimeEnvironment: 'a', supportedWebApis: 'b', limits: 'c' };
    expect(compareNetlify({ hashes, range: '^2.4.2' }, recorded)).toEqual([]);
  });

  it('reports changed pages and a new Deno range', () => {
    const hashes = { runtimeEnvironment: 'x', supportedWebApis: 'b', limits: 'y' };
    const result = compareNetlify({ hashes, range: '^2.6.0' }, recorded);
    expect(result[0]?.items).toEqual(['runtimeEnvironment', 'limits']);
    expect(result[1]?.title).toContain('update the netlify-edge version in source.json to 2.6.0');
  });
});
