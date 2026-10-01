import { globSync, statSync } from 'node:fs';
import path from 'node:path';

/** Files that match a glob, relative to the root, without anything inside `node_modules`. */
export function globFiles(root: string, pattern: string): string[] {
  return globSync(pattern, {
    cwd: root,
    exclude: name => path.basename(name) === 'node_modules',
  }).filter(
    match => statSync(path.resolve(root, match), { throwIfNoEntry: false })?.isFile() === true,
  );
}
