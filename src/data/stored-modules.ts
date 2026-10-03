import {
  checkRangeAndSource,
  fileInPackage,
  hasText,
  inRange,
  invalidEntry,
  readEntries,
} from '@/data/unreached.ts';
import type { EntryBase } from '@/data/unreached.ts';

/** One reviewed case in `data/stored-modules.json`. */
export type StoredModuleEntry = EntryBase & {
  /** The Node.js modules the file stores, as shown in reports, such as `node:http`. */
  modules: string[];
  /** The members the file reads of a stored module. */
  members: string[];
};

export type StoredModuleQuery = {
  package: string;
  version: string;
  /** The file of the usage, as a path from the project root. */
  file: string;
  /** The module as shown in reports. */
  module: string;
};

function checkEntry(where: string, entry: StoredModuleEntry): void {
  const fileName = 'stored-modules.json';
  if (!hasText(entry) || entry.modules.length === 0 || entry.members.length === 0) {
    invalidEntry(fileName, where, 'package, file, modules, members and reason are required');
  }
  if (!entry.modules.every(module => module.startsWith('node:'))) {
    invalidEntry(fileName, where, 'modules must be Node.js modules, such as node:http');
  }
  checkRangeAndSource(fileName, where, entry);
}

let cached: StoredModuleEntry[] | undefined;

/** Reads and checks `data/stored-modules.json`. */
export function loadStoredModules(dataDirectory?: string): StoredModuleEntry[] {
  if (dataDirectory === undefined && cached !== undefined) {
    return cached;
  }
  const entries = readEntries('stored-modules.json', dataDirectory, checkEntry);
  if (dataDirectory === undefined) {
    cached = entries;
  }
  return entries;
}

export function findStoredModule(
  entries: readonly StoredModuleEntry[],
  query: StoredModuleQuery,
): StoredModuleEntry | undefined {
  return entries.find(
    entry =>
      entry.package === query.package &&
      entry.modules.includes(query.module) &&
      inRange(query.version, entry.versions) &&
      fileInPackage(query.file, entry.package) === entry.file,
  );
}
