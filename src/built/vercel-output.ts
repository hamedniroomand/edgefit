import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

import { existingFile } from '@/targets/entry-sources.ts';
import { globFiles } from '@/targets/glob-files.ts';

export type VercelOutput = {
  /** The entry of each function that runs on the Edge runtime, from the root, without duplicates. */
  files: string[];
  /** The `.vc-config.json` files that could not be read. Only the path is kept, never the content. */
  unreadable: string[];
};

const configName = '.vc-config.json';

/** The `functions` folder of a Build Output API layout, given `.vercel/output` or the folder itself. */
function functionsDirectory(root: string, output: string): string | undefined {
  const folder = path.resolve(root, output);
  const functions = path.basename(folder) === 'functions' ? folder : path.join(folder, 'functions');
  return existsSync(functions) && statSync(functions).isDirectory() ? functions : undefined;
}

function toPosix(file: string): string {
  return file.split(path.sep).join('/');
}

function configsIn(root: string, output: string): string[] {
  const functions = functionsDirectory(root, output);
  if (functions === undefined) {
    return [];
  }
  const relative = toPosix(path.relative(root, functions));
  return globFiles(root, `${relative}/**/${configName}`).toSorted();
}

/** Whether a folder is a Build Output API layout: it holds at least one function config. */
export function isVercelOutput(root: string, output: string): boolean {
  return configsIn(root, output).length > 0;
}

type EdgeConfig = { entrypoint: string } | undefined | 'unreadable';

/**
 * Only `runtime` and `entrypoint` are read. The file also holds environment variables and
 * secrets such as encryption keys, so nothing else is kept, and a parse error names the path only.
 */
function readEdgeConfig(file: string): EdgeConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return 'unreadable';
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return 'unreadable';
  }
  const { runtime, entrypoint } = parsed as { runtime?: unknown; entrypoint?: unknown };
  return runtime === 'edge' && typeof entrypoint === 'string' ? { entrypoint } : undefined;
}

/**
 * The entry of every Edge function in a Build Output API layout. A `.func` folder can be a
 * symlink to another, so a file is counted once, by its real path.
 */
export function readVercelOutput(root: string, output: string): VercelOutput {
  const seen = new Set<string>();
  const result: VercelOutput = { files: [], unreadable: [] };
  for (const config of configsIn(root, output)) {
    const absolute = path.resolve(root, config);
    const read = readEdgeConfig(absolute);
    if (read === 'unreadable') {
      result.unreadable.push(config);
      continue;
    }
    const file =
      read === undefined
        ? undefined
        : existingFile(root, path.join(path.dirname(absolute), read.entrypoint));
    if (file !== undefined && !seen.has(realpathSync(path.join(root, file)))) {
      seen.add(realpathSync(path.join(root, file)));
      result.files.push(file);
    }
  }
  return result;
}
