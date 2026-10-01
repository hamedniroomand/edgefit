import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts'];

/** A source file for an edge function: `name.ts`, or `name/index.ts`. */
export function functionFile(directory: string, name: string): string | undefined {
  const candidates = sourceExtensions.flatMap(extension => [
    path.join(directory, `${name}${extension}`),
    path.join(directory, name, `index${extension}`),
  ]);
  return candidates.find(candidate => existsSync(candidate));
}

/** Every function Netlify would run: source files in the directory, and `name/index.ts` folders. */
export function listFunctions(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(item => {
    if (item.isFile()) {
      return sourceExtensions.includes(path.extname(item.name))
        ? [path.join(directory, item.name)]
        : [];
    }
    return item.isDirectory() ? (functionFile(directory, item.name) ?? []) : [];
  });
}
