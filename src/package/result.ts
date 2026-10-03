import type { TargetKey } from '@/types.ts';

/** Bumped on any breaking change to the package result shape. */
export const packageResultVersion = 1;

/** `unchecked`: the entry needs a module that the package does not declare, so it was left out of the summary. */
export type PackageStatus = 'pass' | 'warn' | 'fail' | 'error' | 'unchecked';

export interface EntryStatus {
  status: PackageStatus;
  errors: number;
  warnings: number;
  /** Why the entry could not be checked. Only with `status: "error"` or `"unchecked"`. */
  message?: string;
  /** What the check did not cover, such as an optional peer dependency that is not installed. */
  notes?: string[];
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
const severity: Record<PackageStatus, number> = {
  pass: 0,
  unchecked: 0,
  warn: 1,
  error: 2,
  fail: 3,
};

export function worstStatus(statuses: readonly PackageStatus[]): PackageStatus {
  let worst: PackageStatus = 'pass';
  for (const status of statuses) {
    if (severity[status] > severity[worst]) {
      worst = status;
    }
  }
  return worst;
}

/**
 * The status of a target from the status of each entry. An unchecked entry is left out. When
 * every entry is unchecked, nothing was checked, and that is an error.
 */
export function summaryOf(statuses: readonly PackageStatus[]): PackageStatus {
  const checked = statuses.filter(status => status !== 'unchecked');
  return checked.length === 0 && statuses.length > 0 ? 'error' : worstStatus(checked);
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
