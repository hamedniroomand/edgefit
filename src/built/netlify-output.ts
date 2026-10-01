import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { functionFile, listFunctions } from '@/targets/netlify/functions.ts';

export type NetlifyOutput = {
  /** The edge functions a framework wrote, from the root, without duplicates. */
  files: string[];
  /** The `manifest.json` files that could not be read. Only the path is kept, never the content. */
  unreadable: string[];
};

const manifestName = 'manifest.json';

function isDirectory(directory: string): boolean {
  return existsSync(directory) && statSync(directory).isDirectory();
}

function toPosix(file: string): string {
  return file.split(path.sep).join('/');
}

/**
 * The folders a framework can write edge functions to, given `.netlify`, one of these folders,
 * or a project that has them. `.netlify/edge-functions` is the older layout, with a manifest
 * naming the functions. `.netlify/v1/edge-functions` is the Frameworks API, where every file is
 * a function that sets its own routes.
 */
function folders(root: string, output: string): { legacy: string[]; v1: string[] } {
  const base = path.resolve(root, output);
  const all = [base, path.join(base, 'edge-functions'), path.join(base, 'v1', 'edge-functions')];
  const existing = all.filter(folder => isDirectory(folder));
  return {
    legacy: existing.filter(folder => existsSync(path.join(folder, manifestName))),
    v1: existing.filter(folder => toPosix(folder).endsWith('/v1/edge-functions')),
  };
}

/** Whether a folder holds Netlify framework output: a manifest, or the Frameworks API folder. */
export function isNetlifyOutput(root: string, output: string): boolean {
  const { legacy, v1 } = folders(root, output);
  return legacy.length + v1.length > 0;
}

/** The names in a manifest's `functions`. Nothing else is read, and a bad file is `undefined`. */
function readManifest(file: string): string[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
  const list = (parsed as { functions?: unknown } | null)?.functions;
  if (!Array.isArray(list)) {
    return undefined;
  }
  return list.flatMap(item => {
    const name = (item as { function?: unknown } | null)?.function;
    return typeof name === 'string' ? [name] : [];
  });
}

/** The edge functions a framework wrote, in the older layout, the Frameworks API layout, or both. */
export function readNetlifyOutput(root: string, output: string): NetlifyOutput {
  const { legacy, v1 } = folders(root, output);
  const found = new Set<string>();
  const unreadable: string[] = [];
  for (const folder of legacy) {
    const names = readManifest(path.join(folder, manifestName));
    if (names === undefined) {
      unreadable.push(path.relative(root, path.join(folder, manifestName)));
    }
    for (const name of names ?? []) {
      const file = functionFile(folder, name);
      if (file !== undefined) {
        found.add(toPosix(path.relative(root, file)));
      }
    }
  }
  for (const folder of v1) {
    for (const file of listFunctions(folder)) {
      found.add(toPosix(path.relative(root, file)));
    }
  }
  return { files: [...found].toSorted(), unreadable };
}
