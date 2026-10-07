import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { parseTOML } from 'confbox';

import { parseJsonc } from '@/targets/jsonc.ts';

export interface WranglerConfig {
  file: string;
  main: string | undefined;
  /** Set by a Cloudflare Pages project, which has no `main`. */
  pagesBuildOutputDir: string | undefined;
  compatibilityDate: string | undefined;
  compatibilityFlags: string[] | undefined;
}

const configNames = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'];

const redirectFile = path.join('.wrangler', 'deploy', 'config.json');

/**
 * The config a build wrote for deploying, which `.wrangler/deploy/config.json` points to. Wrangler
 * prefers it to the project's own, and Nitro 3 writes one instead of a config in the root.
 */
function redirectedConfig(root: string): string | undefined {
  const file = path.join(root, redirectFile);
  if (!existsSync(file)) {
    return undefined;
  }
  try {
    const { configPath } = JSON.parse(readFileSync(file, 'utf8')) as { configPath?: unknown };
    const target =
      typeof configPath === 'string' ? path.resolve(path.dirname(file), configPath) : '';
    return existsSync(target) ? target : undefined;
  } catch {
    return undefined;
  }
}

export function findWranglerConfig(root: string): string | undefined {
  return (
    redirectedConfig(root) ??
    configNames.map(name => path.join(root, name)).find(file => existsSync(file))
  );
}

/** A path of the config as a path from the root. Wrangler reads it relative to the config it is written in. */
export function pathFrom(root: string, config: WranglerConfig, value: string): string {
  return path.relative(root, path.resolve(path.dirname(config.file), value));
}

export function mainFrom(root: string, config: WranglerConfig): string | undefined {
  return config.main === undefined ? undefined : pathFrom(root, config, config.main);
}

export function readWranglerConfig(file: string): WranglerConfig {
  const text = readFileSync(file, 'utf8');
  let raw: unknown;
  if (file.endsWith('.toml')) {
    try {
      raw = parseTOML(text);
    } catch (error) {
      throw new Error(`Could not parse ${file}: ${(error as Error).message}`, { cause: error });
    }
  } else {
    raw = parseJsonc(text, file);
  }
  const config = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const flags = config.compatibility_flags;
  return {
    file,
    main: typeof config.main === 'string' ? config.main : undefined,
    pagesBuildOutputDir:
      typeof config.pages_build_output_dir === 'string' ? config.pages_build_output_dir : undefined,
    compatibilityDate:
      typeof config.compatibility_date === 'string' ? config.compatibility_date : undefined,
    compatibilityFlags: Array.isArray(flags)
      ? flags.filter((flag): flag is string => typeof flag === 'string')
      : undefined,
  };
}
