import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { parse } from 'smol-toml';

import { EdgefitError } from '@/errors.ts';
import { readImportMapFile } from '@/targets/deno/deno-config.ts';
import type { ImportMap } from '@/targets/deno/import-map.ts';
import { createDenoTarget } from '@/targets/deno/index.ts';
import { detectEntries } from '@/targets/entries.ts';
import type { EntryDetection } from '@/targets/entries.ts';
import type { Target } from '@/targets/target.ts';
import type { NetlifyOptions } from '@/types.ts';

const defaultDirectory = 'netlify/edge-functions';
const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts'];

interface NetlifyConfig {
  file: string;
  /** `build.edge_functions`, relative to the config file. */
  directory: string | undefined;
  /** `functions.deno_import_map`, relative to the config file. */
  importMap: string | undefined;
  /** Function names from `[[edge_functions]]`, in order. */
  functions: string[];
}

function readNetlifyConfig(root: string, file: string): NetlifyConfig {
  let toml: {
    build?: { edge_functions?: unknown };
    functions?: { deno_import_map?: unknown };
    edge_functions?: unknown;
  };
  try {
    toml = parse(readFileSync(file, 'utf8')) as typeof toml;
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
    throw new EdgefitError(`Could not parse ${path.relative(root, file)}: ${reason}`);
  }
  const directory = toml.build?.edge_functions;
  const importMap = toml.functions?.deno_import_map;
  const declared: unknown[] = Array.isArray(toml.edge_functions) ? toml.edge_functions : [];
  return {
    file,
    importMap: typeof importMap === 'string' ? importMap : undefined,
    directory: typeof directory === 'string' ? directory : undefined,
    functions: declared.flatMap(entry => {
      const name = (entry as { function?: unknown } | null)?.function;
      return typeof name === 'string' ? [name] : [];
    }),
  };
}

/** An explicit `configFile` that is missing is an error; the default `netlify.toml` may be absent. */
function loadConfig(root: string, option: NetlifyOptions['configFile']): NetlifyConfig | undefined {
  if (option === false) {
    return undefined;
  }
  const file = path.resolve(root, option ?? 'netlify.toml');
  if (existsSync(file)) {
    return readNetlifyConfig(root, file);
  }
  if (option !== undefined) {
    throw new EdgefitError(
      `netlify.configFile ${option} does not exist`,
      'Fix the path, or set netlify.configFile to false to skip netlify.toml.',
    );
  }
  return undefined;
}

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
function findEntries(root: string, config: NetlifyConfig | undefined): EntryResult {
  const directory = path.resolve(
    config === undefined ? root : path.dirname(config.file),
    config?.directory ?? defaultDirectory,
  );
  const shown = path.relative(root, directory);
  const exists = existsSync(directory);
  const declared = [...new Set(config?.functions ?? [])].map(name => ({
    name,
    file: exists ? functionFile(directory, name) : undefined,
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
        label: '[[edge_functions]] in netlify.toml',
        guessed: false,
        find: (): string[] => toEntries(declared.flatMap(({ file }) => file ?? [])),
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

interface ImportMapResult {
  importMap: ImportMap | undefined;
  /** The file `netlify.toml` names, relative to the root, when there is one. */
  file: string | undefined;
  notes: string[];
}

function loadImportMap(root: string, config: NetlifyConfig | undefined): ImportMapResult {
  if (config?.importMap === undefined) {
    return { importMap: undefined, file: undefined, notes: [] };
  }
  const file = path.resolve(path.dirname(config.file), config.importMap);
  const shown = path.relative(root, file);
  if (!existsSync(file)) {
    return {
      importMap: undefined,
      file: shown,
      notes: [`The import map ${shown} named in netlify.toml was not found, so none is applied.`],
    };
  }
  try {
    return { importMap: readImportMapFile(file), file: shown, notes: [] };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new EdgefitError(
      `Could not read the import map ${shown} named in netlify.toml: ${reason}`,
    );
  }
}

export function createNetlifyEdgeTarget(root: string, netlify: NetlifyOptions = {}): Target {
  const config = loadConfig(root, netlify.configFile);
  const { entries, notes } = findEntries(root, config);
  const map = loadImportMap(root, config);
  let configNote = 'no netlify.toml found, no import map';
  if (config !== undefined) {
    const mapNote = map.file === undefined ? 'no import map' : `import map ${map.file}`;
    configNote = `edge functions from ${path.relative(root, config.file)}, ${mapNote}`;
  }
  return createDenoTarget(root, {
    netlify: {
      importMap: map.importMap,
      entries,
      notes: [
        'Packages are resolved with the `node` condition: @netlify/edge-bundler 16.1.1 bundles npm dependencies with esbuild for the node platform and passes no conditions (dist/node/npm_dependencies.js). It also picks `module`, `browser` then `main` fields and defines `process.env.NODE_ENV` as production, which edgefit does not apply.',
        "Netlify's docs name no blocked Node.js APIs. The Deno version is the minimum @netlify/edge-bundler requires, not the one Netlify runs.",
        ...map.notes,
        ...notes,
      ],
      settings: configNote,
    },
  });
}
