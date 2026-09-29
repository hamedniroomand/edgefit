import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

import { EdgefitError } from '@/errors.ts';
import { findWranglerConfig, readWranglerConfig } from '@/targets/workerd/wrangler.ts';

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

/** The entry of a build output, given as the entry file itself or the directory holding it. */
export function builtEntry(root: string, built: string): string {
  const output = path.resolve(root, built);
  if (!existsSync(output)) {
    throw new EdgefitError(`Built output not found: ${built}`, 'Build the project first.');
  }
  if (isFile(output)) {
    return path.relative(root, output);
  }
  const candidates = [manifestEntry(output), ...entryNames.map(name => path.join(output, name))];
  const entry = candidates.find(file => file !== undefined && isFile(file));
  if (entry === undefined) {
    throw new EdgefitError(
      `No entry found in ${built}.`,
      'Pass the entry file itself, e.g. --built .output/server/index.mjs.',
    );
  }
  return path.relative(root, entry);
}
