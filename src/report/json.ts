import { countLevels } from '@/core/check.ts';
import type { CheckResult } from '@/core/check.ts';
import { EdgefitError } from '@/errors.ts';
import type { Finding, TargetKey } from '@/types.ts';

/** Bumped on any breaking change to the JSON shape. */
export const jsonReportVersion = 1;

/** The parts of a `check --format json` report that other commands read back. */
export interface JsonReport {
  version: number;
  targets: { key: TargetKey; findings: Finding[] }[];
}

export function formatJson(result: CheckResult): string {
  const report = {
    version: jsonReportVersion,
    summary: countLevels(result),
    targets: result.reports.map(targetReport => ({
      ...targetReport.target,
      entry: targetReport.entry,
      modules: targetReport.modules,
      ignored: targetReport.ignored,
      findings: targetReport.findings,
    })),
  };
  return `${JSON.stringify(report, null, 2)}\n`;
}

function isJsonReport(value: unknown): value is JsonReport {
  const report = value as Partial<JsonReport> | null;
  return (
    typeof report === 'object' &&
    report !== null &&
    Array.isArray(report.targets) &&
    report.targets.every(target => Array.isArray(target.findings))
  );
}

/** Reads back a report written by `check --format json`. `source` names it in errors. */
export function parseJsonReport(text: string, source: string): JsonReport {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new EdgefitError(`${source} is not valid JSON.`);
  }
  if (!isJsonReport(value)) {
    throw new EdgefitError(
      `${source} is not an edgefit JSON report.`,
      'Write one with `edgefit check --format json`.',
    );
  }
  if (value.version !== jsonReportVersion) {
    throw new EdgefitError(
      `${source} has report version ${value.version}; this edgefit reads version ${jsonReportVersion}.`,
      'Write both reports with the same edgefit version.',
    );
  }
  return value;
}
