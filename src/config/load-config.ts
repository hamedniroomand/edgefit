import { existsSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

import { EdgefitError } from '@/errors.ts';
import type { EdgefitConfig } from '@/types.ts';

import { validateConfig } from './validate-config.ts';

export const configNames = [
  'edgefit.config.ts',
  'edgefit.config.mts',
  'edgefit.config.js',
  'edgefit.config.mjs',
];

export interface LoadedConfig {
  file: string | undefined;
  config: EdgefitConfig;
}

export function findConfig(root: string): string | undefined {
  return configNames.map(name => path.join(root, name)).find(file => existsSync(file));
}

async function bundleConfig(file: string): Promise<string> {
  const result = await build({
    entryPoints: [file],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    // Dependencies such as `edgefit` itself resolve from the project's node_modules at import time.
    packages: 'external',
    logLevel: 'silent',
  });
  return result.outputFiles[0]?.text ?? '';
}

/**
 * Bundles the config to a temporary module next to it, so TypeScript configs load on any
 * supported Node version and relative imports keep resolving, then imports it.
 */
async function importConfig(file: string): Promise<unknown> {
  const temporary = path.join(
    path.dirname(file),
    `.edgefit.config.${process.pid}.${Date.now()}.mjs`,
  );
  await writeFile(temporary, await bundleConfig(file));
  try {
    const module = (await import(pathToFileURL(temporary).href)) as { default?: unknown };
    return module.default;
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function loadConfig(root: string, explicitFile?: string): Promise<LoadedConfig> {
  const file = explicitFile === undefined ? findConfig(root) : path.resolve(root, explicitFile);
  if (file === undefined) {
    return { file: undefined, config: {} };
  }
  if (!existsSync(file)) {
    throw new EdgefitError(`Config file not found: ${file}`);
  }
  let value: unknown;
  try {
    value = await importConfig(file);
  } catch (error) {
    throw new EdgefitError(`Could not load ${file}: ${(error as Error).message}`);
  }
  return { file, config: validateConfig(value, path.relative(root, file)) };
}
