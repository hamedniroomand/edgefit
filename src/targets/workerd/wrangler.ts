import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { parse as parseToml } from 'smol-toml';

import { parseJsonc } from '@/targets/jsonc.ts';

export interface WranglerConfig {
  file: string;
  main: string | undefined;
  compatibilityDate: string | undefined;
  compatibilityFlags: string[] | undefined;
}

const configNames = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml'];

export function findWranglerConfig(root: string): string | undefined {
  return configNames.map(name => path.join(root, name)).find(file => existsSync(file));
}

export function readWranglerConfig(file: string): WranglerConfig {
  const text = readFileSync(file, 'utf8');
  let raw: unknown;
  if (file.endsWith('.toml')) {
    try {
      raw = parseToml(text);
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
    compatibilityDate:
      typeof config.compatibility_date === 'string' ? config.compatibility_date : undefined,
    compatibilityFlags: Array.isArray(flags)
      ? flags.filter((flag): flag is string => typeof flag === 'string')
      : undefined,
  };
}
