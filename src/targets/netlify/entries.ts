import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { detectEntries } from '@/targets/entries.ts';
import type { EntryDetection } from '@/targets/entries.ts';

import type { NetlifyConfig } from './config.ts';
import { hasInlineRoute } from './inline-config.ts';

const defaultDirectory = 'netlify/edge-functions';
const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts'];

/** A source file for an edge function: `name.ts`, or `name/index.ts`. */
function functionFile(directory: string, name: string): string | undefined {
  const candidates = sourceExtensions.flatMap(extension => [
    path.join(directory, `${name}${extension}`),
    path.join(directory, name, `index${extension}`),
  ]);
  return candidates.find(candidate => existsSync(candidate));
}

interface EntryResult {
  entries: EntryDetection;
  notes: string[];
}

/** Every function Netlify would run: source files in the directory, and `name/index.ts` folders. */
function listFunctions(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(item => {
    if (item.isFile()) {
      return sourceExtensions.includes(path.extname(item.name))
        ? [path.join(directory, item.name)]
        : [];
    }
    return item.isDirectory() ? (functionFile(directory, item.name) ?? []) : [];
  });
}

/** Netlify runs every function in the edge functions directory, so each one is an entry. */
export function findEntries(root: string, config: NetlifyConfig | undefined): EntryResult {
  const directory = path.resolve(
    config === undefined ? root : path.dirname(config.file),
    config?.directory ?? defaultDirectory,
  );
  const shown = path.relative(root, directory);
  const exists = existsSync(directory);
  const declared = [...new Set(config?.functions ?? [])].map(name => ({
    name,
    file: functionFile(directory, name),
  }));
  const listed = exists ? listFunctions(directory) : [];
  const toEntries = (files: string[]): string[] =>
    files.map(file => path.relative(root, file)).sort();
  const notes = declared.flatMap(({ name, file }) =>
    exists && file === undefined
      ? [`Function ${name} is declared in netlify.toml but not found in ${shown}.`]
      : [],
  );
  if (!exists) {
    notes.push(`No ${shown} directory found.`);
  } else if (listed.length === 0) {
    notes.push(`No edge function found in ${shown}.`);
  }
  const entries = detectEntries(
    [
      {
        label: '[[edge_functions]] in netlify.toml, and functions that export config with a path',
        guessed: false,
        find: (): string[] =>
          toEntries([
            ...new Set([
              ...declared.flatMap(({ file }) => file ?? []),
              ...listed.filter(file => hasInlineRoute(file)),
            ]),
          ]),
      },
      {
        label: `the ${shown} directory${exists ? '' : ' (not found)'}`,
        guessed: false,
        find: (): string[] => toEntries(listed),
      },
    ],
    false,
  );
  return { entries, notes };
}
