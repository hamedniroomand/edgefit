import { existsSync } from 'node:fs';
import path from 'node:path';

import { staleNote } from '@/built/stale.ts';
import type { EntryDetection, EntrySource } from '@/targets/entries.ts';
import { existingFile } from '@/targets/entry-sources.ts';
import { globFiles } from '@/targets/glob-files.ts';

import { adviceFor, staticNote } from './pages-advice.ts';
import { pathFrom } from './wrangler.ts';
import type { WranglerConfig } from './wrangler.ts';

/**
 * The extensions that Pages reads in `functions/`: `generateConfigFromFileTree` in
 * @cloudflare/pages-functions, which wrangler uses. A type file has no handler.
 */
const functionExtension = /(?<!\.d)\.(?:mjs|js|ts|tsx|jsx)$/u;

type Pages = {
  sources: EntrySource[];
  /** What to do when the sources find nothing. */
  advice: () => string;
  /** The result when the sources find nothing because the output holds static files only. */
  staticOutput: NonNullable<EntryDetection['staticOutput']>;
};

/**
 * Where a Pages project keeps the code that runs: `_worker.js` in the build output (advanced
 * mode), else the `functions/` folder, which Pages ignores when `_worker.js` exists.
 */
export function pagesSources(root: string, wrangler: WranglerConfig): Pages | undefined {
  if (wrangler.pagesBuildOutputDir === undefined || wrangler.main !== undefined) {
    return undefined;
  }
  // The root itself is `.`, not an empty name, in the text that names the folder.
  const directory = pathFrom(root, wrangler, wrangler.pagesBuildOutputDir) || '.';
  const configFile = path.relative(root, wrangler.file);
  const label = `${configFile} "pages_build_output_dir"`;
  return {
    sources: [
      {
        label: `${label}: ${directory}/_worker.js`,
        guessed: false,
        built: true,
        find: () =>
          [path.join(directory, '_worker.js'), path.join(directory, '_worker.js', 'index.js')]
            .map(file => existingFile(root, file))
            .filter(file => file !== undefined)
            .slice(0, 1),
        notes: files => staleNote(root, files, []),
      },
      {
        label: 'the functions/ folder',
        guessed: false,
        find: () =>
          existsSync(path.join(root, 'functions'))
            ? globFiles(root, 'functions/**/*')
                .filter(file => functionExtension.test(file))
                .toSorted()
            : [],
      },
    ],
    advice: () => adviceFor(root, directory),
    staticOutput: () => {
      const note = staticNote(root, directory);
      return note === undefined
        ? undefined
        : { source: `${label}: ${directory} (static files only)`, note };
    },
  };
}
