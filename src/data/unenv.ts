import { memberPath } from '@/data/compat-index.ts';
import { findDataDirectory, readDataFile } from '@/data/data-directory.ts';
import type { ApiRef } from '@/types.ts';

type UnenvFile = {
  /** The unenv release the exports were read from. */
  unenv: string;
  /** Per Node module, the exports that are constant values, such as `EOL` or `constants`. */
  modules: Record<string, string[]>;
};

let cached: Map<string, Set<string>> | undefined;

function constantExports(): Map<string, Set<string>> {
  if (cached === undefined) {
    const file = readDataFile<UnenvFile>(findDataDirectory(), 'unenv.json');
    cached = new Map(Object.entries(file.modules).map(([name, keys]) => [name, new Set(keys)]));
  }
  return cached;
}

/**
 * Whether the export is a constant value unenv provides. A function or class is never listed,
 * because unenv marks only some of its stubs and a no-op looks like a real function.
 * ponytail: a nested member is not known until the data lists members below the first level.
 */
export function isUnenvConstant(api: ApiRef): boolean {
  const path = memberPath(api);
  const [name] = path;
  return (
    path.length === 1 && name !== undefined && constantExports().get(api.module)?.has(name) === true
  );
}
