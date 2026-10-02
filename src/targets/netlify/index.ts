import { existsSync } from 'node:fs';
import path from 'node:path';

import { EdgefitError } from '@/errors.ts';
import { readImportMapFile } from '@/targets/deno/deno-config.ts';
import type { ImportMap } from '@/targets/deno/import-map.ts';
import { createDenoTarget } from '@/targets/deno/index.ts';
import type { Target } from '@/targets/target.ts';
import type { NetlifyOptions } from '@/types.ts';

import { loadConfig } from './config.ts';
import type { NetlifyConfig } from './config.ts';
import { findEntries } from './entries.ts';

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
        "Netlify's docs name no Deno version and no blocked Node.js APIs. The version and the blocked APIs (subprocesses, and file writes outside /tmp) come from edgefit's production witness on Netlify.",
        ...map.notes,
        ...notes,
      ],
      settings: configNote,
    },
  });
}
