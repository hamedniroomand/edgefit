import path from 'node:path';

import { detectEntries } from '@/targets/entries.ts';
import type { EntryDetection, EntrySource } from '@/targets/entries.ts';
import { fallbackSources } from '@/targets/entry-sources.ts';

import { pagesSources } from './pages.ts';
import { mainFrom } from './wrangler.ts';
import type { WranglerConfig } from './wrangler.ts';

/**
 * A wrangler `main`, else for a Pages project its worker or functions, else the conventions. A
 * Pages project does not use the conventions, or the entries of other targets: a `src/index.ts` there is not what Pages runs.
 */
export function workerdEntries(root: string, wrangler: WranglerConfig | undefined): EntryDetection {
  const wranglerFile = wrangler === undefined ? undefined : path.relative(root, wrangler.file);
  const main: EntrySource = {
    label: `${wranglerFile ?? 'wrangler config'} "main"`,
    guessed: false,
    find: () =>
      [wrangler === undefined ? undefined : mainFrom(root, wrangler)].flatMap(file => file ?? []),
  };
  const pages = wrangler === undefined ? undefined : pagesSources(root, wrangler);
  if (pages === undefined) {
    return detectEntries([main, ...fallbackSources(root)], true);
  }
  // Not shared: Pages handlers are not entries for other runtimes, and their guesses are not Pages'.
  return { ...detectEntries([main, ...pages.sources], false), advice: pages.advice };
}
