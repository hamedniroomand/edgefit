import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { findDenoConfig, readJsonc } from '@/targets/deno/deno-config.ts';
import type { EntrySource } from '@/targets/entries.ts';

export const sourceExtensions = ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs'];

const buildDirectory = /^(?:dist|build)\//u;

type PackageJson = Record<string, unknown>;

export function readPackageJson(root: string): PackageJson | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    return typeof value === 'object' && value !== null ? (value as PackageJson) : undefined;
  } catch {
    return undefined;
  }
}

/** The file as a path from the root, or `undefined` when it is missing or outside the root. */
export function existingFile(root: string, file: string): string | undefined {
  const relative = path.relative(root, path.resolve(root, file)).split(path.sep).join('/');
  const inside = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  const found = inside && statSync(path.join(root, relative), { throwIfNoEntry: false })?.isFile();
  return found === true ? relative : undefined;
}

/**
 * Whether the root holds several packages. Their entries are not the root's, and this only reads
 * the root, so a guess made here would be about the wrong package.
 */
export function isWorkspaceRoot(root: string): boolean {
  const denoConfig = findDenoConfig(root);
  return (
    readPackageJson(root)?.workspaces !== undefined ||
    existsSync(path.join(root, 'pnpm-workspace.yaml')) ||
    (denoConfig !== undefined && readJsonc(denoConfig).workspace !== undefined)
  );
}

type SourceInput = { label: string; find: () => string[] };

/** A source that reads a convention. It finds nothing at a workspace root, and says so. */
export function guessedSource(root: string, { label, find }: SourceInput): EntrySource {
  const workspace = isWorkspaceRoot(root);
  return {
    label: workspace ? `${label} (not used at a workspace root)` : label,
    guessed: true,
    find: () => (workspace ? [] : find()),
  };
}

/** The first string a value ends in: a string, or the first string of a condition object. */
function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(item => firstString(item)).find(item => item !== undefined);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value)
      .filter(([condition]) => condition !== 'types')
      .map(([, item]) => firstString(item))
      .find(item => item !== undefined);
  }
  return undefined;
}

function fieldFiles(root: string, fields: readonly string[]): string[] {
  const manifest = readPackageJson(root);
  const exports = manifest?.exports;
  const candidates = fields.map(field => {
    if (field !== 'exports') {
      return manifest?.[field];
    }
    const hasSubpaths =
      typeof exports === 'object' &&
      exports !== null &&
      Object.keys(exports).some(key => key.startsWith('.'));
    // Only the `.` entry, which is what importing the package gives.
    return hasSubpaths ? (exports as Record<string, unknown>)['.'] : exports;
  });
  return candidates.flatMap(candidate => {
    const file = firstString(candidate);
    return file === undefined ? [] : (existingFile(root, file) ?? []);
  });
}

const fieldLabel = (fields: readonly string[]): string =>
  `package.json ${fields.map(field => `"${field}"`).join(', ')}`;

/** Declared in `package.json`: the first of the fields that names a file, unless it is build output. */
export function packageFieldSource(
  root: string,
  fields: readonly string[] = ['exports', 'module', 'main'],
): EntrySource {
  return {
    label: fieldLabel(fields),
    guessed: false,
    find: () =>
      fieldFiles(root, fields)
        .filter(file => !buildDirectory.test(file))
        .slice(0, 1),
  };
}

/** The same fields when they name build output, which may be stale: a guess. */
export function builtFieldSource(root: string): EntrySource {
  const fields = ['exports', 'module', 'main'];
  return guessedSource(root, {
    label: `${fieldLabel(fields)} (build output)`,
    find: () =>
      fieldFiles(root, fields)
        .filter(file => buildDirectory.test(file))
        .slice(0, 1),
  });
}

const conventionNames = ['src/index', 'index'].flatMap(base =>
  sourceExtensions.map(extension => `${base}${extension}`),
);

function conventionFile(root: string): string[] {
  const found = conventionNames
    .map(name => existingFile(root, name))
    .find(file => file !== undefined);
  return found === undefined ? [] : [found];
}

/** What a project with no declaration tends to use: `package.json` fields, then `src/index.*`, then `index.*`, and last build output. */
export function fallbackSources(root: string): EntrySource[] {
  return [
    packageFieldSource(root),
    guessedSource(root, { label: 'src/index.* or index.*', find: () => conventionFile(root) }),
    builtFieldSource(root),
  ];
}

/**
 * The file a start command runs: `bun run src/index.ts`, `bun --hot src/index.ts`,
 * `deno serve main.ts`. Only the first command of a chain is read.
 * ponytail: a flag's value is not told from a file, so the first source file that exists wins.
 * Upgrade by listing the flags that take a value.
 */
export function entryFromCommand(
  root: string,
  command: string,
  runner: 'bun' | 'deno',
): string | undefined {
  const [first = ''] = command.split(/&&|\|\||;|\|/u);
  const tokens = first
    .trim()
    .split(/\s+/u)
    .map(token => token.replaceAll(/^['"]|['"]$/gu, ''))
    .filter(token => token !== '');
  while (/^[A-Za-z_]\w*=/u.test(tokens[0] ?? '')) {
    tokens.shift();
  }
  if (tokens.shift() !== runner) {
    return undefined;
  }
  // `bun run dev` names a script, not a file, and has no source extension.
  return tokens
    .filter(token => sourceExtensions.includes(path.extname(token)))
    .map(token => existingFile(root, token))
    .find(file => file !== undefined);
}

/** A guessed source for `package.json` `scripts.<name>`. */
export function scriptSource(root: string, name: string, runner: 'bun'): EntrySource {
  return guessedSource(root, {
    label: `package.json scripts.${name}`,
    find: () => {
      const script = (readPackageJson(root)?.scripts as Record<string, unknown> | undefined)?.[
        name
      ];
      const file = typeof script === 'string' ? entryFromCommand(root, script, runner) : undefined;
      return file === undefined ? [] : [file];
    },
  });
}
