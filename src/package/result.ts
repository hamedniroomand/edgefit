import type { TargetKey } from '@/types.ts';

/** Bumped on any breaking change to the package result shape. */
export const packageResultVersion = 1;

export type PackageStatus = 'pass' | 'warn' | 'fail' | 'error';

export interface EntryStatus {
  status: PackageStatus;
  errors: number;
  warnings: number;
  /** Why the entry could not be checked. Only with `status: "error"`. */
  message?: string;
}

export interface PackageEntryResult {
  subpath: string;
  specifier: string;
  results: Partial<Record<TargetKey, EntryStatus>>;
}

export interface PackageResult {
  version: typeof packageResultVersion;
  package: string;
  /** The version that was checked. */
  resolved: string;
  checkedAt: string;
  edgefit: string;
  /** Runtime versions of the pinned data, from `data/source.json`. */
  data: Record<string, string>;
  targets: TargetKey[];
  /** Each target's worst status across the entries. */
  summary: Partial<Record<TargetKey, PackageStatus>>;
  /** Settings and notes each target ran with, as `check` prints them. */
  context: Partial<Record<TargetKey, { settings: string; notes: string[] }>>;
  entries: PackageEntryResult[];
}

// A warning is never rounded up to a pass, and a check that failed to run is not a pass either.
const severity: Record<PackageStatus, number> = { pass: 0, warn: 1, error: 2, fail: 3 };

export function worstStatus(statuses: readonly PackageStatus[]): PackageStatus {
  let worst: PackageStatus = 'pass';
  for (const status of statuses) {
    if (severity[status] > severity[worst]) {
      worst = status;
    }
  }
  return worst;
}

export function statusOf(errors: number, warnings: number): PackageStatus {
  if (errors > 0) {
    return 'fail';
  }
  return warnings > 0 ? 'warn' : 'pass';
}

/** The worst status across every target, for a one-word verdict. */
export function overallStatus(result: PackageResult): PackageStatus {
  return worstStatus(Object.values(result.summary));
}

export function formatPackageJson(result: PackageResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}
