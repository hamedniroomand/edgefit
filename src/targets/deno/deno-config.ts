import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { parseJsonc } from '@/targets/jsonc.ts';

import { isPathSpecifier } from './import-map.ts';
import type { ImportMap } from './import-map.ts';

export interface WorkspaceMember {
  name: string;
  directory: string;
  /** Export keys such as `.` and `./sub`, with paths relative to `directory`. */
  exports: Record<string, string>;
  /** The import map of the member's files: the workspace root's map below the member's own. */
  importMap: ImportMap | undefined;
}

export interface DenoConfig {
  file: string;
  /** From `imports`, or from the file `importMap` points to, below the workspace root's map. */
  importMap: ImportMap | undefined;
  /** The config files the import map comes from: this file, the workspace root, or both. */
  importMapFiles: string[];
  /** The members of the workspace that the config belongs to. */
  members: WorkspaceMember[];
}

const configNames = ['deno.json', 'deno.jsonc'];

export function findDenoConfig(root: string): string | undefined {
  return configNames.map(name => path.join(root, name)).find(file => existsSync(file));
}

export function readJsonc(file: string): Record<string, unknown> {
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

/** The `imports` of a standalone import map file. */
export function readImportMapFile(file: string): ImportMap | undefined {
  const imports = toImports(readJsonc(file).imports);
  return imports === undefined ? undefined : { imports, directory: path.dirname(file) };
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

// ponytail: only a trailing `/*` is a glob. Upgrade to a glob library for other patterns.
function memberDirectories(rootDirectory: string, workspace: unknown): string[] {
  const entries =
    typeof workspace === 'object' && workspace !== null && 'members' in workspace
      ? workspace.members
      : workspace;
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.flatMap((entry: unknown) => {
    if (typeof entry !== 'string') {
      return [];
    }
    if (!entry.endsWith('/*')) {
      return [path.resolve(rootDirectory, entry)];
    }
    const parent = path.resolve(rootDirectory, entry.slice(0, -2));
    return existsSync(parent)
      ? readdirSync(parent, { withFileTypes: true })
          .filter(item => item.isDirectory())
          .map(item => path.join(parent, item.name))
      : [];
  });
}

interface WorkspaceRoot {
  file: string;
  config: Record<string, unknown>;
  members: string[];
}

/** Like Deno, only the nearest parent config can be the root. It must list the directory. */
function findWorkspaceRoot(directory: string): WorkspaceRoot | undefined {
  for (let current = path.dirname(directory); ; current = path.dirname(current)) {
    const file = findDenoConfig(current);
    if (file !== undefined) {
      const config = readJsonc(file);
      const members = memberDirectories(current, config.workspace);
      return members.includes(directory) ? { file, config, members } : undefined;
    }
    if (path.dirname(current) === current) {
      return undefined;
    }
  }
}

function toExports(value: unknown): Record<string, string> {
  return typeof value === 'string' ? { '.': value } : (toImports(value) ?? {});
}

function readMember(directory: string, rootImportMap: ImportMap | undefined): WorkspaceMember[] {
  const file = findDenoConfig(directory);
  const config = file === undefined ? undefined : readJsonc(file);
  return file !== undefined && typeof config?.name === 'string'
    ? [
        {
          name: config.name,
          directory,
          exports: toExports(config.exports),
          importMap: mergeImportMaps(readImportMap(file, config), rootImportMap),
        },
      ]
    : [];
}

/** The root's map is the base. Its relative targets become absolute, as the member has its own directory. */
function mergeImportMaps(
  own: ImportMap | undefined,
  root: ImportMap | undefined,
): ImportMap | undefined {
  if (root === undefined) {
    return own;
  }
  const inherited = Object.fromEntries(
    Object.entries(root.imports).map(([key, value]) => [
      key,
      isPathSpecifier(value)
        ? path.resolve(root.directory, value) + (value.endsWith('/') ? '/' : '')
        : value,
    ]),
  );
  return {
    imports: { ...inherited, ...own?.imports },
    directory: own?.directory ?? root.directory,
  };
}

export function readDenoConfig(file: string): DenoConfig {
  const config = readJsonc(file);
  const directory = path.dirname(file);
  const root = findWorkspaceRoot(directory);
  const rootFile = root?.file ?? file;
  const rootImportMap = readImportMap(rootFile, root?.config ?? config);
  const ownImportMap = readImportMap(file, config);
  const members = root?.members ?? memberDirectories(directory, config.workspace);
  // The root can be a member too: Deno allows `name` and `exports` in the root config.
  const directories = members.length === 0 ? [] : [path.dirname(rootFile), ...members];
  return {
    file,
    importMap: mergeImportMaps(ownImportMap, root === undefined ? undefined : rootImportMap),
    importMapFiles: [
      ...(ownImportMap === undefined ? [] : [file]),
      ...(root === undefined || rootImportMap === undefined ? [] : [rootFile]),
    ],
    members: directories.flatMap(member => readMember(member, rootImportMap)),
  };
}
