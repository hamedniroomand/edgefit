import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { semver } from '@/targets/runtime-version.ts';
import type { BunOptions } from '@/types.ts';

export interface BunVersion {
  version: string;
  /** Where the version came from, for the report. */
  origin: string;
}

function readPackageManager(root: string): string | undefined {
  const file = path.join(root, 'package.json');
  if (!existsSync(file)) {
    return undefined;
  }
  try {
    const { packageManager } = JSON.parse(readFileSync(file, 'utf8')) as {
      packageManager?: unknown;
    };
    return typeof packageManager === 'string' ? packageManager : undefined;
  } catch {
    return undefined;
  }
}

/** The Bun version the project pins with `packageManager: "bun@x"` or `.bun-version`. */
export function findPinnedVersion(root: string): BunVersion | undefined {
  const packageManager = readPackageManager(root);
  if (packageManager?.startsWith('bun@') === true) {
    const version = semver.exec(packageManager)?.[0];
    if (version !== undefined) {
      return { version, origin: 'package.json packageManager' };
    }
  }
  const file = path.join(root, '.bun-version');
  const version = existsSync(file) ? semver.exec(readFileSync(file, 'utf8'))?.[0] : undefined;
  return version === undefined ? undefined : { version, origin: '.bun-version' };
}

export function resolveBunVersion(
  root: string,
  options: BunOptions,
  dataVersion: string,
): BunVersion {
  if (options.version !== undefined) {
    return { version: options.version, origin: 'the edgefit config' };
  }
  return (
    findPinnedVersion(root) ?? {
      version: dataVersion,
      origin: 'the compatibility data; no pinned Bun version found',
    }
  );
}
