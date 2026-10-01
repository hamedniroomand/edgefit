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
  /** A note for the report, set when the entries were guessed. */
  note: string | undefined;
}

const explicitSource = '--entry or the config';

function explain(target: Target): string[] {
  const { searched } = target.entries;
  return searched.length === 0 ? [] : [`  ${target.info.key}: ${searched.join(', ')}`];
}

/**
 * An entry from the CLI or the config applies to every target. Without one, a target uses, in
 * order: its own exact match, the exact match of the first other shared target that has one, and
 * its own guess. A guess is never lent to another target. A target left without entries fails the
 * run, and the error lists where each such target looked.
 */
export function entriesFor(
  root: string,
  targets: readonly Target[],
  config: EdgefitConfig,
): TargetEntries[] {
  const configured = [config.entry ?? []].flat();
  if (configured.length > 0) {
    const entries = expandEntries(root, configured);
    return targets.map(() => ({ entries, source: explicitSource, note: undefined }));
  }
  const lender = targets.find(
    target => target.entries.shared && target.entries.exact !== undefined,
  );
  const found = targets.map((target): TargetEntries | undefined => {
    const { exact, guess, shared } = target.entries;
    if (exact !== undefined) {
      return { entries: exact.files, source: exact.source, note: undefined };
    }
    if (shared && lender?.entries.exact !== undefined) {
      const { files, source } = lender.entries.exact;
      return { entries: files, source: `${lender.info.key}: ${source}`, note: undefined };
    }
    return guess === undefined
      ? undefined
      : {
          entries: guess.files,
          source: guess.source,
          note: `The entries were guessed from ${guess.source}. Pass --entry if they are wrong.`,
        };
  });
  const missing = targets.filter((_target, index) => found[index] === undefined);
  if (missing.length > 0) {
    const searched = missing.flatMap(target => explain(target));
    throw new EdgefitError(
      'No entry point to scan.',
      [
        ...(searched.length > 0 ? ['Searched:', ...searched] : []),
        'Pass --entry, or set `entry` in edgefit.config.ts.',
      ].join('\n'),
    );
  }
  return found.flatMap(item => item ?? []);
}
