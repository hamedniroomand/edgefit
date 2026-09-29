import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const marker = path.join('data', 'source.json');

/**
 * The package's `data` directory. Searched upward because this module sits at a different
 * depth in `src/` than in the bundled `dist/`.
 */
export function findDataDirectory(start = import.meta.dirname): string {
  for (let directory = start; ; directory = path.dirname(directory)) {
    if (existsSync(path.join(directory, marker))) {
      return path.join(directory, 'data');
    }
    if (path.dirname(directory) === directory) {
      throw new Error(`edgefit's data directory was not found above ${start}`);
    }
  }
}

export function readDataFile<T>(dataDirectory: string, relativePath: string): T {
  return JSON.parse(readFileSync(path.join(dataDirectory, relativePath), 'utf8')) as T;
}
