import path from 'node:path';

import { EdgefitError } from '@/errors.ts';
import { globFiles } from '@/targets/glob-files.ts';
import type { Target } from '@/targets/index.ts';
import type { EdgefitConfig } from '@/types.ts';

const globCharacters = /[*?[\]{}]/u;

function matchPattern(root: string, pattern: string): string[] {
  const matches = globFiles(root, pattern);
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

const shownEntries = 3;

/** `entry a.ts`, or `entries a.ts, b.ts, c.ts +2 more` when there are more than a few. */
export function describeEntries(entries: readonly string[]): string {
  if (entries.length === 1) {
    return `entry ${entries[0]}`;
  }
  const rest = entries.length - shownEntries;
  const more = rest > 0 ? ` +${rest} more` : '';
  return `entries ${entries.slice(0, shownEntries).join(', ')}${more}`;
}

export interface TargetEntries {
  entries: string[];
  /** Where the entries came from, as shown in the settings line. */
  source: string;
  /** Notes for the report: that the entries were guessed, or that build output is out of date. */
  notes: string[];
  /** The entries are build output. */
  built: boolean;
}

const explicitSource = '--entry or the config';

function explain(target: Target): string[] {
  const { searched } = target.entries;
  return searched.length === 0 ? [] : [`  ${target.info.key}: ${searched.join(', ')}`];
}

/**
 * An entry from the CLI or the config applies to every target. Without one, a target uses, in
 * order: its own exact match, the exact match of the first other shared target that has one, and
 * its own guess. A guess is never lent to another target. A target left without entries gets
 * `undefined` and is skipped, unless no target has any: then the run fails and the error lists
 * where each target looked.
 */
export function entriesFor(
  root: string,
  targets: readonly Target[],
  config: EdgefitConfig,
): (TargetEntries | undefined)[] {
  const configured = [config.entry ?? []].flat();
  if (configured.length > 0) {
    const entries = expandEntries(root, configured);
    return targets.map(() => ({ entries, source: explicitSource, notes: [], built: false }));
  }
  const lender = targets.find(
    target => target.entries.shared && target.entries.exact !== undefined,
  );
  const found = targets.map((target): TargetEntries | undefined => {
    const { exact, guess, shared } = target.entries;
    if (exact !== undefined) {
      return { entries: exact.files, source: exact.source, notes: exact.notes, built: exact.built };
    }
    if (shared && lender?.entries.exact !== undefined) {
      const { files, source, notes, built } = lender.entries.exact;
      return { entries: files, source: `${lender.info.key}: ${source}`, notes, built };
    }
    return guess === undefined
      ? undefined
      : {
          entries: guess.files,
          source: guess.source,
          notes: [
            ...guess.notes,
            `The entries were guessed from ${guess.source}. Pass --entry if they are wrong.`,
          ],
          built: guess.built,
        };
  });
  if (found.every(item => item === undefined)) {
    const searched = targets.flatMap(target => explain(target));
    throw new EdgefitError(
      'No entry point to scan.',
      [
        ...(searched.length > 0 ? ['Searched:', ...searched] : []),
        'Pass --entry, or set `entry` in edgefit.config.ts.',
      ].join('\n'),
    );
  }
  return found;
}
