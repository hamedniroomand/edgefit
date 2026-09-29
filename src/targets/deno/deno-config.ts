import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { parseJsonc } from '@/targets/jsonc.ts';

import type { ImportMap } from './import-map.ts';

export interface DenoConfig {
  file: string;
  /** From `imports`, or from the file `importMap` points to. */
  importMap: ImportMap | undefined;
}

const configNames = ['deno.json', 'deno.jsonc'];

export function findDenoConfig(root: string): string | undefined {
  return configNames.map(name => path.join(root, name)).find(file => existsSync(file));
}

function readJsonc(file: string): Record<string, unknown> {
  const raw = parseJsonc(readFileSync(file, 'utf8'), file);
  return (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
}

function toImports(value: unknown): Record<string, string> | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

/** Deno ignores `importMap` when the config has its own `imports`. */
function readImportMap(file: string, config: Record<string, unknown>): ImportMap | undefined {
  const imports = toImports(config.imports);
  if (imports !== undefined) {
    return { imports, directory: path.dirname(file) };
  }
  if (typeof config.importMap !== 'string') {
    return undefined;
  }
  const mapFile = path.resolve(path.dirname(file), config.importMap);
  const mapImports = toImports(readJsonc(mapFile).imports);
  return mapImports === undefined
    ? undefined
    : { imports: mapImports, directory: path.dirname(mapFile) };
}

export function readDenoConfig(file: string): DenoConfig {
  return { file, importMap: readImportMap(file, readJsonc(file)) };
}
