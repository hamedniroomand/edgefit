import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const lockfiles = [
  'pnpm-lock.yaml',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
];

function modified(file: string): number | undefined {
  return statSync(file, { throwIfNoEntry: false })?.mtimeMs;
}

function topLevelOfSrc(root: string): string[] {
  try {
    return readdirSync(path.join(root, 'src')).map(name => path.join('src', name));
  } catch {
    return [];
  }
}

/** What changes the build: the sources found, the lockfile, and the top-level entries of `src/`. */
function inputs(root: string, sources: readonly string[]): string[] {
  return [...sources, ...lockfiles, 'package.json', ...topLevelOfSrc(root)];
}

/**
 * A note when build output is older than the code it was built from, so a report that no longer
 * matches the code is not taken for a fresh one. The output's age is that of its newest file.
 */
export function staleNote(
  root: string,
  output: readonly string[],
  sources: readonly string[],
): string[] {
  const built = Math.max(...output.map(file => modified(path.join(root, file)) ?? 0));
  let newest: { file: string; time: number } | undefined;
  for (const file of inputs(root, sources)) {
    const time = modified(path.join(root, file));
    if (time !== undefined && time > (newest?.time ?? built)) {
      newest = { file, time };
    }
  }
  return newest === undefined
    ? []
    : [
        `The build output is older than ${newest.file}. Build again, or the report may not match the code.`,
      ];
}
