import type { Category, TargetKey } from '@/types.ts';

/** Bumped on any breaking change to the package result shape. */
export const packageResultVersion = 2;

/** `unchecked`: the entry needs a module that the package does not declare, so it was left out of the summary. */
export type PackageStatus = 'pass' | 'warn' | 'fail' | 'error' | 'unchecked';

/** A finding that only some exports of an entry reach. */
export interface ExportFinding {
  api: string;
  category: Category;
  level: 'error' | 'warning';
  /** What is wrong, without repeating the API. */
  detail: string;
}

/** The findings that an entry has only when its export `name` is used. */
export interface ExportResult {
  name: string;
  /** The worst level of its findings. */
  level: 'error' | 'warning';
  findings: ExportFinding[];
}

export interface EntryStatus {
  status: PackageStatus;
  /** The findings that stay count here: the ones in the module body, or that every export reaches. */
  errors: number;
  warnings: number;
  /** The findings that count in `errors` and `warnings`, in the order the CLI prints them. */
  findings?: ExportFinding[];
  /** The findings that only some exports reach, by export. They do not change `status`. */
  exports?: ExportResult[];
  /** Why the entry could not be checked. Only with `status: "error"` or `"unchecked"`. */
  message?: string;
  /** What the check did not cover, such as an optional peer dependency that is not installed. */
  notes?: string[];
}

export interface WorstEntry {
  subpath: string;
  status: PackageStatus;
}

/** The export with the worst findings of the entries that decide a target. */
export interface WorstExport {
  subpath: string;
  name: string;
  status: PackageStatus;
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
  /** The subpath that decides each target when the package has no `.` entry, or when the caller names one. Left out otherwise. */
  main?: string;
  /** Each target's status: the main entry (`.`), or the worst entry for a package without one. */
  summary: Partial<Record<TargetKey, PackageStatus>>;
  /** The worst entry of a target, when it is worse than the main entry that decides the target. */
  worst?: Partial<Record<TargetKey, WorstEntry>>;
  /** The export with the worst findings that only some exports reach, among all entries, when it is worse than the result of the target. */
  worstExport?: Partial<Record<TargetKey, WorstExport>>;
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

/**
 * The result of one target. The main entry decides it, because that is what an import of the
 * package gets: `.`, or the subpath that the caller names with `main`. A package without a main
 * entry, or with one that was not checked, takes the worst entry. `worst` names the worst entry
 * when it is worse than the result.
 */
export function targetResult(
  entries: readonly PackageEntryResult[],
  key: TargetKey,
  mainSubpath = '.',
): { status: PackageStatus; worst?: WorstEntry } {
  const found = entries.flatMap(entry => {
    const status = entry.results[key]?.status;
    return status === undefined ? [] : [{ subpath: entry.subpath, status }];
  });
  const all = summaryOf(found.map(item => item.status));
  const main = found.find(item => item.subpath === mainSubpath);
  if (main === undefined || main.status === 'unchecked') {
    return { status: all };
  }
  const worst = found.find(item => item.status === all);
  return severity[all] > severity[main.status] && worst !== undefined
    ? { status: main.status, worst }
    : { status: main.status };
}

/** The export with the worst findings among all entries of a target. An export with an error ranks above one with a warning. */
export function worstExportOf(
  entries: readonly PackageEntryResult[],
  key: TargetKey,
): WorstExport | undefined {
  const found = entries.flatMap(entry =>
    (entry.results[key]?.exports ?? []).map(item => ({
      subpath: entry.subpath,
      name: item.name,
      status: item.level === 'error' ? ('fail' as const) : ('warn' as const),
    })),
  );
  return found.toSorted((a, b) => severity[b.status] - severity[a.status])[0];
}

/** The result of every target, and the worst entry and the worst export where they are worse than the result. */
export function summarize(
  entries: readonly PackageEntryResult[],
  targets: readonly TargetKey[],
  mainSubpath?: string,
): Pick<PackageResult, 'summary' | 'worst' | 'worstExport'> {
  const summary: PackageResult['summary'] = {};
  const worst: NonNullable<PackageResult['worst']> = {};
  const worstExport: NonNullable<PackageResult['worstExport']> = {};
  for (const key of targets) {
    const decided = targetResult(entries, key, mainSubpath);
    summary[key] = decided.status;
    if (decided.worst !== undefined) {
      worst[key] = decided.worst;
    }
    const exported = worstExportOf(entries, key);
    if (exported !== undefined && severity[exported.status] > severity[decided.status]) {
      worstExport[key] = exported;
    }
  }
  return {
    summary,
    ...(Object.keys(worst).length === 0 ? {} : { worst }),
    ...(Object.keys(worstExport).length === 0 ? {} : { worstExport }),
  };
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
