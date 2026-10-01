import path from 'node:path';

import { versionNotes } from '@/targets/runtime-version.ts';
import { loadTargetData } from '@/targets/target-data.ts';
import type { Target } from '@/targets/target.ts';
import type { DenoOptions, Runtime, TargetKey } from '@/types.ts';

import { findDenoConfig, readDenoConfig } from './deno-config.ts';
import type { DenoConfig } from './deno-config.ts';
import type { ImportMap } from './import-map.ts';
import { denoSpecifiers } from './specifiers-plugin.ts';

// Deno's npm resolver matches these, then `import` and `default`.
export const denoConditions = ['deno', 'node'];

const platforms: Partial<Record<TargetKey, string>> = {
  deno: 'Deno',
  'deno-deploy': 'Deno Deploy',
  'netlify-edge': 'Netlify Edge Functions',
};

export interface DenoTargetOptions extends DenoOptions {
  /** Applies Deno Deploy's override layer and Deno version on top of the Deno CLI's data. */
  deploy?: boolean;
  /** Applies Netlify Edge's override layer and Web API data on top of the Deno CLI's data. */
  netlify?: {
    defaultEntries: readonly string[];
    entryHint: string | undefined;
    notes: readonly string[];
    /** Netlify reads its import map from `netlify.toml`, never from `deno.json`. */
    importMap: ImportMap | undefined;
    /** Where the entry and import map came from. */
    settings: string;
  };
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

interface Variant {
  key: TargetKey;
  /** The export conditions packages are resolved with. */
  conditions: readonly string[];
  webKey: 'deno' | 'netlify';
  /** Every runtime the target is at once: Netlify Edge Functions are Deno, and Netlify. */
  runtimes: readonly Runtime[];
}

function variantOf(options: DenoTargetOptions): Variant {
  if (options.deploy === true) {
    return { key: 'deno-deploy', conditions: denoConditions, webKey: 'deno', runtimes: ['deno'] };
  }
  if (options.netlify !== undefined) {
    // @netlify/edge-bundler bundles npm dependencies with esbuild for the node platform and passes
    // no conditions, so packages resolve with `node`, not `deno` (dist/node/npm_dependencies.js).
    return {
      key: 'netlify-edge',
      conditions: ['node'],
      webKey: 'netlify',
      runtimes: ['deno', 'netlify'],
    };
  }
  return { key: 'deno', conditions: denoConditions, webKey: 'deno', runtimes: ['deno'] };
}

function describeSettings(
  root: string,
  options: DenoTargetOptions,
  version: string,
  config: DenoConfig | undefined,
): string {
  if (options.netlify !== undefined) {
    return `Netlify Edge Functions on Deno ${version} or newer, ${options.netlify.settings}`;
  }
  const runtime = options.deploy === true ? `Deno Deploy on Deno ${version}` : `Deno ${version}`;
  return `${runtime}, ${describeImportMap(root, config)}`;
}

export function createDenoTarget(root: string, options: DenoTargetOptions = {}): Target {
  const { netlify } = options;
  const { key, conditions, webKey, runtimes } = variantOf(options);
  const layers: TargetKey[] = key === 'deno' ? [] : [key];
  const { index, matrixSource, overrideSources, description, globals } = loadTargetData(
    'deno',
    layers,
    undefined,
    webKey,
  );
  const config = netlify ? undefined : loadDenoConfig(root, options.configFile);
  const dataVersion = matrixSource.versions.deno ?? 'unknown';
  // Only a platform layer names a Deno version of its own: the one the platform runs.
  // `unknown` means the layer has not pinned one, so the data's version stands.
  const [layer] = layers;
  const layerVersion = overrideSources.find(source => source.provider === `overrides/${layer}`)
    ?.versions[layer as string];
  const version =
    layerVersion === undefined || layerVersion === 'unknown' ? dataVersion : layerVersion;

  return {
    info: {
      key,
      platform: platforms[key] ?? key,
      conditions,
      data: description,
      settings: describeSettings(root, options, version, config),
      notes: [...versionNotes('Deno', version, dataVersion), ...(netlify?.notes ?? [])],
    },
    runtimes,
    resolvePlatform: 'node',
    nodeEnv: netlify ? 'production' : undefined,
    resolvePlugins: [denoSpecifiers(netlify ? netlify.importMap : config?.importMap)],
    defaultEntries: netlify?.defaultEntries ?? [],
    entryHint: netlify?.entryHint,
    globals,
    lookup: api => index.lookup(api),
    hasProblemsBelow: api => index.hasProblemsBelow(api),
  };
}
