import manifest from '@pkg' with { type: 'json' };

import { readRuntimeVersions } from '@/data/manifest.ts';
import { EdgefitError } from '@/errors.ts';
import { compareTargetKeys } from '@/targets/index.ts';
import type { TargetKey } from '@/types.ts';

import { checkEntry, inSequence } from './check-entry.ts';
import { packageEntries } from './entry.ts';
import type { PackageEntry } from './entry.ts';
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
  /** The subpath that decides the result of each target, for a package that has no `.` entry. */
  main?: string;
  registry?: string;
  /** Keep the temporary project, and report where it is through `onKeep`. */
  keep?: boolean;
  onKeep?: (directory: string) => void;
}

/** The subpath that the caller names as the main entry has to be one of the entries to check. */
function assertMain(
  name: string,
  entries: readonly PackageEntry[],
  main: string | undefined,
): void {
  if (main !== undefined && !entries.some(entry => entry.subpath === main)) {
    throw new EdgefitError(
      `${name} has no checked entry ${main} to use as the main entry.`,
      `Use one of: ${entries.map(entry => entry.subpath).join(', ')}.`,
    );
  }
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
    assertMain(workspace.name, entries, options.main);
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
      ...(options.main === undefined ? {} : { main: options.main }),
      ...summarize(rows, targets, options.main),
      context,
      entries: rows,
    };
  } finally {
    await workspace.dispose();
  }
}
