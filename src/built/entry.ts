import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

import { EdgefitError } from '@/errors.ts';
import { findVercelSources } from '@/targets/vercel/entries.ts';
import { findWranglerConfig, readWranglerConfig } from '@/targets/workerd/wrangler.ts';

import { staleNote } from './stale.ts';
import { isVercelOutput, readVercelOutput } from './vercel-output.ts';

// Nitro and Nuxt, SvelteKit's Cloudflare adapter, Astro's Cloudflare adapter, OpenNext.
const entryNames = ['index.mjs', 'index.js', '_worker.js', '_worker.js/index.js', 'worker.js'];

function isFile(file: string): boolean {
  return existsSync(file) && statSync(file).isFile();
}

/** The wrangler config some adapters write next to their output, whose `main` is the entry. */
function manifestEntry(directory: string): string | undefined {
  const config = findWranglerConfig(directory);
  const main = config === undefined ? undefined : readWranglerConfig(config).main;
  return main === undefined ? undefined : path.resolve(directory, main);
}

export type BuiltEntries = { entries: string[]; notes: string[] };

/** The entries of a Vercel Build Output API layout, or `undefined` when the folder is not one. */
function vercelEntries(root: string, built: string, output: string): BuiltEntries | undefined {
  if (!isVercelOutput(root, output)) {
    return undefined;
  }
  const { files, unreadable } = readVercelOutput(root, output);
  if (files.length === 0) {
    throw new EdgefitError(
      `No Edge functions found in ${built}.`,
      'Only functions with `"runtime": "edge"` in their .vc-config.json are checked. Pass the entry file itself to check another one.',
    );
  }
  return {
    entries: files,
    notes: [
      ...staleNote(root, files, findVercelSources(root).entries),
      ...unreadable.map(file => `${file} could not be read, so that function was skipped.`),
    ],
  };
}

/**
 * The entries of a build output, given as an entry file, or as the directory holding one or
 * several: a Nitro or adapter output has one entry, a Vercel Build Output API layout has one for
 * each Edge function.
 */
export function builtEntries(root: string, built: string): BuiltEntries {
  const output = path.resolve(root, built);
  if (!existsSync(output)) {
    throw new EdgefitError(`Built output not found: ${built}`, 'Build the project first.');
  }
  if (isFile(output)) {
    return { entries: [path.relative(root, output)], notes: [] };
  }
  const vercel = vercelEntries(root, built, output);
  if (vercel !== undefined) {
    return vercel;
  }
  const candidates = [manifestEntry(output), ...entryNames.map(name => path.join(output, name))];
  const entry = candidates.find(file => file !== undefined && isFile(file));
  if (entry === undefined) {
    throw new EdgefitError(
      `No entry found in ${built}.`,
      'Pass the entry file itself, e.g. --built .output/server/index.mjs.',
    );
  }
  return { entries: [path.relative(root, entry)], notes: [] };
}

/** Whether the entry sits in a Nitro build output, which is marked by a `nitro.json` beside it. */
export function isBuildOutput(root: string, entry: string): boolean {
  const base = path.resolve(root);
  for (
    let directory = path.dirname(path.resolve(base, entry));
    directory.startsWith(base) && directory !== base;
    directory = path.dirname(directory)
  ) {
    if (isFile(path.join(directory, 'nitro.json'))) {
      return true;
    }
  }
  return false;
}
