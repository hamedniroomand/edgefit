import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { parseTOML } from 'confbox';

import { EdgefitError } from '@/errors.ts';
import type { NetlifyOptions } from '@/types.ts';

export interface NetlifyConfig {
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
    toml = parseTOML(readFileSync(file, 'utf8')) as typeof toml;
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
export function loadConfig(
  root: string,
  option: NetlifyOptions['configFile'],
): NetlifyConfig | undefined {
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
