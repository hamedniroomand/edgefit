import manifest from '@pkg' with { type: 'json' };

import { readRuntimeVersions } from '@/data/manifest.ts';
import { EdgefitError } from '@/errors.ts';
import { compareTargetKeys } from '@/targets/index.ts';
import type { TargetKey } from '@/types.ts';

import { checkEntry, inSequence } from './check-entry.ts';
import { packageEntries } from './entry.ts';
import { packageResultVersion, summarize } from './result.ts';
import type { PackageResult } from './result.ts';
import { parsePackageSpec } from './spec.ts';
import type { PackageSpec } from './spec.ts';
import { createWorkspace } from './workspace.ts';

export interface CheckPackageOptions {
  /** Defaults to the compared targets: workerd, bun and deno. */
  targets?: readonly TargetKey[];
  /** Check only these subpaths, e.g. `./client`. */
  subpaths?: readonly string[];
  /** Subpaths to leave out. */
  skip?: readonly string[];
  registry?: string;
  /** Keep the temporary project, and report where it is through `onKeep`. */
  keep?: boolean;
  onKeep?: (directory: string) => void;
}

/**
 * Installs a package into a throwaway project without running any of its code, then checks each
 * public entry point with every export treated as used.
 * @param spec `name`, `name@version`, `@scope/name@tag`, a directory or a `.tgz` file.
 */
export async function checkPackage(
  spec: string | PackageSpec,
  options: CheckPackageOptions = {},
): Promise<PackageResult> {
  const parsed = typeof spec === 'string' ? parsePackageSpec(spec) : spec;
  const targets = [...(options.targets ?? compareTargetKeys)];
  const workspace = await createWorkspace(parsed, {
    registry: options.registry,
    keep: options.keep,
  });
  try {
    if (options.keep === true) {
      options.onKeep?.(workspace.root);
    }
    const entries = packageEntries(workspace.manifest, workspace.name, {
      skip: options.skip,
      only: options.subpaths,
    });
    if (entries.length === 0) {
      throw new EdgefitError(
        `${workspace.name} has no public entry point to check.`,
        options.subpaths === undefined ? undefined : 'Check the --export subpaths.',
      );
    }
    const context: PackageResult['context'] = {};
    const rows = await inSequence(entries, async (entry, index) => {
      const row = await checkEntry(workspace.root, entry, index, targets, context);
      return row;
    });
    return {
      version: packageResultVersion,
      package: workspace.name,
      resolved: workspace.resolved,
      checkedAt: new Date().toISOString(),
      edgefit: manifest.version,
      data: readRuntimeVersions(),
      targets,
      ...summarize(rows, targets),
      context,
      entries: rows,
    };
  } finally {
    await workspace.dispose();
  }
}
