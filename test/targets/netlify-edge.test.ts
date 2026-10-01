import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import { EdgefitError } from '@/errors.ts';
import { createTarget, isTargetKey } from '@/targets/index.ts';
import { createNetlifyEdgeTarget } from '@/targets/netlify/index.ts';
import { edgefitError, fixture } from '~/helpers.ts';

describe('netlify-edge target', () => {
  it('is a known target that reuses the Deno data, and resolves with node like the bundler', () => {
    expect(isTargetKey('netlify-edge')).toBe(true);
    const { info } = createTarget('netlify-edge', fixture('netlify-app'), {});
    expect(info.key).toBe('netlify-edge');
    expect(info.platform).toBe('Netlify Edge Functions');
    expect(info.conditions).toEqual(['node']);
    expect(info.data).toContain('deno 2.9.7');
    expect(info.settings).toBe(
      'Netlify Edge Functions on Deno 2.4.2 or newer, edge functions from netlify.toml, import map import_map.json',
    );
  });

  it('reads the import map from netlify.toml and ignores deno.json', () => {
    const { info } = createNetlifyEdgeTarget(fixture('deno-app'));
    expect(info.settings).toContain('no import map');
    expect(info.settings).not.toContain('deno.jsonc');
  });

  it('notes that Deno 2.4.2 is older than the data', () => {
    const { info } = createNetlifyEdgeTarget(fixture('netlify-app'));
    expect(info.notes.join('\n')).toContain('Deno 2.4.2 is older than the data (2.9.7)');
  });

  it('is Deno and Netlify at once for runtime checks', () => {
    expect(createNetlifyEdgeTarget(fixture('netlify-app')).runtimes).toEqual(['deno', 'netlify']);
    expect(createTarget('deno-deploy', fixture('deno-app'), {}).runtimes).toEqual(['deno']);
  });

  it('says where its export conditions come from', () => {
    const { info } = createNetlifyEdgeTarget(fixture('netlify-app'));
    expect(info.notes.join('\n')).toContain(
      'bundles npm dependencies with esbuild for the node platform',
    );
  });

  it('answers Node lookups like Deno', () => {
    const target = createNetlifyEdgeTarget(fixture('netlify-app'));
    expect(target.lookup({ module: 'util', path: ['isString'] }).status).toBe('unsupported');
  });
});

describe('netlify-edge entry detection', () => {
  it('uses the function declared in netlify.toml as the entry', () => {
    const target = createNetlifyEdgeTarget(fixture('netlify-app'));
    expect(target.defaultEntries).toEqual(['netlify/edge-functions/hello.ts']);
  });

  it('uses every function when several exist', () => {
    const target = createNetlifyEdgeTarget(fixture('netlify-multi'));
    expect(target.defaultEntries).toEqual([
      'netlify/edge-functions/a.ts',
      'netlify/edge-functions/b.ts',
    ]);
  });

  it('reports a project with no edge functions directory', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'edgefit-netlify-'));
    const target = createNetlifyEdgeTarget(root);
    expect(target.defaultEntries).toEqual([]);
    expect(target.info.settings).toContain('no netlify.toml found');
    expect(target.info.notes.join('\n')).toContain('No netlify/edge-functions directory');
  });

  it('ignores netlify.toml when configFile is false', () => {
    const target = createNetlifyEdgeTarget(fixture('netlify-app'), { configFile: false });
    // Two files, no declaration: both run.
    expect(target.defaultEntries).toHaveLength(2);
  });
});

describe('netlify-edge config problems', () => {
  it('finds a function in a name/index.ts folder without a declaration', () => {
    const target = createNetlifyEdgeTarget(fixture('netlify-nested'));
    expect(target.defaultEntries).toEqual(['netlify/edge-functions/hello/index.ts']);
  });

  it('says which declared function and import map are missing, and uses the one that exists', () => {
    const target = createNetlifyEdgeTarget(fixture('netlify-missing'));
    expect(target.defaultEntries).toEqual(['netlify/edge-functions/a.ts']);
    const notes = target.info.notes.join('\n');
    expect(notes).toContain('Function gone is declared in netlify.toml but not found');
    expect(notes).toContain('The import map nope.json named in netlify.toml was not found');
  });

  it('reports a malformed netlify.toml as a user error', () => {
    expect(() => createNetlifyEdgeTarget(fixture('netlify-badtoml'))).toThrow(EdgefitError);
    expect(() => createNetlifyEdgeTarget(fixture('netlify-badtoml'))).toThrow(
      /Could not parse netlify\.toml/u,
    );
  });

  it('rejects an explicit configFile that does not exist, and accepts a missing default', () => {
    expect(() =>
      createNetlifyEdgeTarget(fixture('netlify-app'), { configFile: 'typo.toml' }),
    ).toThrow(/netlify\.configFile typo\.toml does not exist/u);
    expect(() => createNetlifyEdgeTarget(fixture('netlify-nested'))).not.toThrow();
  });
});

describe('netlify-edge without an entry', () => {
  it('says what it found, in its own terms, before any report exists', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'edgefit-netlify-'));
    const error = await edgefitError(check({ root, config: { targets: ['netlify-edge'] } }));
    expect(error.message).toBe('No entry point to scan.');
    expect(error.hint).toContain('No netlify/edge-functions directory found.');
    expect(error.hint).not.toContain('wrangler');
  });

  it('keeps the generic hint for a target that has none', async () => {
    const error = await edgefitError(
      check({ root: fixture('netlify-multi'), config: { targets: ['deno'] } }),
    );
    expect(error.hint).toContain('wrangler');
  });
});
