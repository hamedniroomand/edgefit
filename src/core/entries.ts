import { globSync, statSync } from 'node:fs';
import path from 'node:path';

import { EdgefitError } from '@/errors.ts';
import type { Target } from '@/targets/index.ts';
import type { EdgefitConfig } from '@/types.ts';

const globCharacters = /[*?[\]{}]/u;

function isFile(file: string): boolean {
  return statSync(file, { throwIfNoEntry: false })?.isFile() === true;
}

function matchPattern(root: string, pattern: string): string[] {
  const matches = globSync(pattern, {
    cwd: root,
    exclude: name => path.basename(name) === 'node_modules',
  }).filter(match => isFile(path.resolve(root, match)));
  if (matches.length === 0) {
    throw new EdgefitError(
      `No file matches the entry pattern ${pattern}.`,
      'Check the pattern, which is relative to the project root.',
    );
  }
  return matches;
}

/**
 * Turns entries and glob patterns into a sorted list of files relative to the root, without
 * duplicates. A plain path is kept even when the file is missing, so the build reports it.
 */
export function expandEntries(root: string, patterns: readonly string[]): string[] {
  const files = patterns.flatMap(pattern =>
    globCharacters.test(pattern) ? matchPattern(root, pattern) : [pattern],
  );
  const relative = files.map(file => path.relative(root, path.resolve(root, file)));
  return [...new Set(relative)].sort();
}

export interface TargetEntries {
  entries: string[];
  /** Says where the entries came from when the target borrowed them. */
  note: string | undefined;
}

/**
 * An entry from the CLI or the config applies to every target. Without one, each target finds its
 * own, and a target that finds none uses the entries of the first target that has some.
 */
export function entriesFor(
  root: string,
  targets: readonly Target[],
  config: EdgefitConfig,
): TargetEntries[] {
  const configured = [config.entry ?? []].flat();
  if (configured.length > 0) {
    const entries = expandEntries(root, configured);
    return targets.map(() => ({ entries, note: undefined }));
  }
  const lender = targets.find(target => target.defaultEntries.length > 0);
  if (lender === undefined) {
    // A target that looked for an entry and found none says why, in its own terms.
    throw new EdgefitError(
      'No entry point to scan.',
      targets.find(target => target.entryHint !== undefined)?.entryHint ??
        'Pass --entry, set `entry` in edgefit.config.ts, or set `main` in the wrangler config.',
    );
  }
  return targets.map(target =>
    target.defaultEntries.length > 0
      ? { entries: [...target.defaultEntries], note: undefined }
      : {
          entries: [...lender.defaultEntries],
          note: `No entry found for this target, so it checks the entries of ${lender.info.key}: ${lender.defaultEntries.join(', ')}.`,
        },
  );
}
