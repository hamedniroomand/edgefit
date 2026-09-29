import { readFileSync } from 'node:fs';

const start = '//#region ';
const end = '//#endregion';

/** Which original file each line of a build chunk came from, read from its `//#region` markers. */
export interface Regions {
  /** The file a 1-based line belongs to, or `undefined` for code outside a real file. */
  fileAt: (line: number) => string | undefined;
}

/** Virtual modules such as `#nitro/virtual/tasks` do not name a file. */
function isFile(name: string): boolean {
  return name !== '' && !name.startsWith('#') && !name.includes('\0') && !name.includes('virtual:');
}

/**
 * Rolldown marks the code of each module in a chunk with `//#region <path>` and `//#endregion`.
 * Without a sourcemap that is the only record of which package a line came from.
 */
export function parseRegions(text: string): Regions {
  const files: (string | undefined)[] = [];
  let current: string | undefined;
  for (const line of text.split('\n')) {
    if (line.startsWith(start)) {
      const name = line.slice(start.length).trim();
      current = isFile(name) ? name : undefined;
      files.push(current);
    } else if (line.startsWith(end)) {
      files.push(current);
      current = undefined;
    } else {
      files.push(current);
    }
  }
  return { fileAt: line => files[line - 1] };
}

export function readRegions(file: string): Regions | undefined {
  try {
    return parseRegions(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}
