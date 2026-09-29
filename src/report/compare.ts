import type { CheckResult, TargetReport } from '@/core/check.ts';
import type { Category, Finding, TargetKey } from '@/types.ts';

import { ownerName } from './summary.ts';

/** A target's result for one API. A target that never reaches the API has no cell. */
export type CompareCell = Category | 'supported';

export interface CompareRow {
  api: string;
  /** Packages that reach the API on any target, with `your code` for the project's own. */
  packages: string[];
  results: Partial<Record<TargetKey, CompareCell>>;
  /** The findings behind the row's cells, for `--verbose`. */
  findings: Finding[];
}

export interface CompareOptions {
  /** Include APIs that every target reaching them supports. */
  all: boolean;
}

// When one API has several findings on a target, the worst one decides the cell.
const severity: Category[] = ['unsupported', 'mocked', 'mismatch', 'web', 'unknown'];

function cellFor(report: TargetReport, api: string): CompareCell | undefined {
  const categories = new Set(
    report.findings.filter(finding => finding.api === api).map(finding => finding.category),
  );
  const worst = severity.find(category => categories.has(category));
  if (worst !== undefined) {
    return worst;
  }
  return report.supported.some(entry => entry.api === api) ? 'supported' : undefined;
}

function packagesFor(reports: readonly TargetReport[], api: string): string[] {
  const owners = reports.flatMap(report => [
    ...report.findings.filter(finding => finding.api === api).map(finding => ownerName(finding)),
    ...report.supported.filter(entry => entry.api === api).map(entry => ownerName(entry)),
  ]);
  return [...new Set(owners)].toSorted();
}

/** Pivots per-target reports into one row per API, sorted by API. */
export function compareRows(result: CheckResult, options: CompareOptions): CompareRow[] {
  const { reports } = result;
  const apis = new Set(reports.flatMap(report => report.findings.map(finding => finding.api)));
  if (options.all) {
    for (const entry of reports.flatMap(report => report.supported)) {
      apis.add(entry.api);
    }
  }
  return [...apis].toSorted().map(api => ({
    api,
    packages: packagesFor(reports, api),
    results: Object.fromEntries(
      reports.flatMap(report => {
        const cell = cellFor(report, api);
        return cell === undefined ? [] : [[report.target.key, cell]];
      }),
    ),
    findings: reports.flatMap(report => report.findings.filter(finding => finding.api === api)),
  }));
}
