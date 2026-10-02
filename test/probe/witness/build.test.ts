import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { build, typeofModule } from '@scripts/probe/witness/build.mjs';
import { witnessSpec } from '@scripts/probe/witness/spec.mjs';
import { afterEach, describe, expect, it } from 'vite-plus/test';

const directories: string[] = [];
const staged = (platform: 'netlify' | 'vercel'): string => {
  const directory = mkdtempSync(path.join(tmpdir(), 'edgefit-witness-'));
  directories.push(directory);
  build(platform, directory);
  return directory;
};
const load = async (file: string): Promise<Record<string, unknown>> =>
  (await import(pathToFileURL(file).href)) as Record<string, unknown>;

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('build', () => {
  it('stages a Netlify project whose function answers with the spec hash', async () => {
    const directory = staged('netlify');
    expect(readFileSync(path.join(directory, 'netlify.toml'), 'utf8')).toContain('path = "/"');
    expect(existsSync(path.join(directory, 'netlify/edge-functions/witness.mjs'))).toBe(true);
    expect(existsSync(path.join(directory, 'lib/witness/globals-data.mjs'))).toBe(false);
    const handler = (await load(path.join(directory, 'lib/witness/netlify.mjs')))
      .default as () => Promise<Response>;
    const results = (await (await handler()).json()) as { specHash: string; checks: object };
    expect(results.specHash).toBe(witnessSpec('netlify').hash);
    expect(Object.keys(results.checks)).toContain('subprocess');
  });

  it('stages a Vercel project with the middleware and the edge route', async () => {
    const directory = staged('vercel');
    expect(readFileSync(path.join(directory, 'middleware.js'), 'utf8')).toContain(
      "matcher: '/middleware'",
    );
    expect(existsSync(path.join(directory, 'api/witness.js'))).toBe(true);
    expect(existsSync(path.join(directory, 'robots.txt'))).toBe(true);
    const { handle } = (await load(path.join(directory, 'lib/witness/vercel.mjs'))) as {
      handle: (entry: string) => Promise<Response>;
    };
    const results = (await (await handle('middleware')).json()) as {
      entry: string;
      outcomes: Record<string, string>;
      types: Record<string, string>;
    };
    expect(results.entry).toBe('middleware');
    expect(results.outcomes['buffer.Buffer']).toBe('present');
    expect(results.types).toMatchObject({ fetch: 'function', NaN: 'number' });
  });
});

describe('typeofModule', () => {
  it('names each global in code', () => {
    expect(typeofModule(['fetch'])).toContain('"fetch": typeof fetch,');
  });

  it('refuses a reserved word', () => {
    expect(() => typeofModule(['import'])).toThrow('import is not an identifier');
  });

  it('refuses a name that is not an identifier', () => {
    expect(() => typeofModule(['a-b'])).toThrow('a-b is not an identifier');
  });
});
