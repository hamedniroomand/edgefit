import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * The extensions Netlify accepts for an edge function, in its order of precedence: a lower index
 * wins. @netlify/edge-bundler 16.1.1, dist/node/finder.js (`ALLOWED_EXTENSIONS`).
 */
export const functionExtensions = ['.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'];

function isFile(file: string): boolean {
  return statSync(file, { throwIfNoEntry: false })?.isFile() === true;
}

/**
 * The file of a function: `name/name.ext` or `name/index.ext` in a folder, or `name.ext` beside
 * the others. The folder form comes first, as a folder beats a file of the same name in the
 * finder, and in it `name.ext` is tried before `index.ext` for each extension in turn
 * (`findFunctionInDirectory`).
 */
export function functionFile(directory: string, name: string): string | undefined {
  const inFolder = functionExtensions.flatMap(extension => [
    path.join(directory, name, `${name}${extension}`),
    path.join(directory, name, `index${extension}`),
  ]);
  const beside = functionExtensions.map(extension => path.join(directory, `${name}${extension}`));
  return [...inFolder, ...beside].find(candidate => isFile(candidate));
}

/**
 * Every function Netlify would run. Of the files with one name, the one with the lowest extension
 * wins, so `a.js` beats `a.ts` (`removeDuplicatesByExtension`), and a folder beats a file of its
 * name, because a name without an extension ranks first there.
 */
export function listFunctions(directory: string): string[] {
  const items = readdirSync(directory, { withFileTypes: true });
  const folders = items.filter(item => item.isDirectory()).map(item => item.name);
  const winners = new Map<string, { file: string; rank: number }>();
  for (const item of items.filter(entry => entry.isFile())) {
    const extension = path.extname(item.name);
    const name = path.basename(item.name, extension);
    const rank = functionExtensions.indexOf(extension);
    const best = winners.get(name);
    if (rank !== -1 && !folders.includes(name) && (best === undefined || rank < best.rank)) {
      winners.set(name, { file: path.join(directory, item.name), rank });
    }
  }
  return [
    ...[...winners.values()].map(winner => winner.file),
    ...folders.flatMap(name => functionFile(directory, name) ?? []),
  ];
}
