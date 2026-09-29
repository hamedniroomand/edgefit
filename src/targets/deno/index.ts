import path from 'node:path';

import { versionNotes } from '@/targets/runtime-version.ts';
import { loadTargetData } from '@/targets/target-data.ts';
import type { Target } from '@/targets/target.ts';
import type { DenoOptions } from '@/types.ts';

import { findDenoConfig, readDenoConfig } from './deno-config.ts';
import type { DenoConfig } from './deno-config.ts';
import { denoSpecifiers } from './specifiers-plugin.ts';

// Deno's npm resolver matches these, then `import` and `default`.
export const denoConditions = ['deno', 'node'];

export interface DenoTargetOptions extends DenoOptions {
  /** Applies Deno Deploy's override layer and Deno version on top of the Deno CLI's data. */
  deploy?: boolean;
}

function loadDenoConfig(root: string, option: DenoOptions['configFile']): DenoConfig | undefined {
  if (option === false) {
    return undefined;
  }
  const file = option === undefined ? findDenoConfig(root) : path.resolve(root, option);
  return file === undefined ? undefined : readDenoConfig(file);
}

function describeImportMap(root: string, config: DenoConfig | undefined): string {
  if (config === undefined) {
    return 'no import map (no deno.json found)';
  }
  const file = path.relative(root, config.file);
  return config.importMap === undefined ? `no import map in ${file}` : `import map from ${file}`;
}

export function createDenoTarget(root: string, options: DenoTargetOptions = {}): Target {
  const deploy = options.deploy === true;
  const { index, matrixSource, overrideSources, description, globals } = loadTargetData(
    'deno',
    deploy ? ['deno-deploy'] : [],
  );
  const config = loadDenoConfig(root, options.configFile);
  const dataVersion = matrixSource.versions.deno ?? 'unknown';
  // Only the Deploy layer names a Deno version of its own: the one Deno Deploy runs.
  const version =
    overrideSources.map(source => source.versions['deno-deploy']).find(Boolean) ?? dataVersion;
  const runtime = deploy ? `Deno Deploy on Deno ${version}` : `Deno ${version}`;

  return {
    info: {
      key: deploy ? 'deno-deploy' : 'deno',
      platform: deploy ? 'Deno Deploy' : 'Deno',
      conditions: denoConditions,
      data: description,
      settings: `${runtime}, ${describeImportMap(root, config)}`,
      notes: versionNotes('Deno', version, dataVersion),
    },
    resolvePlatform: 'node',
    resolvePlugins: [denoSpecifiers(config?.importMap)],
    defaultEntry: undefined,
    globals,
    lookup: api => index.lookup(api),
    hasProblemsBelow: api => index.hasProblemsBelow(api),
  };
}
