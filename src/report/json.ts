import { countLevels } from '@/core/check.ts';
import type { CheckResult, SkippedTarget } from '@/core/check.ts';
import type { FailedTarget } from '@/core/run-targets.ts';
import { EdgefitError } from '@/errors.ts';
import { findingId } from '@/report/finding-id.ts';
import type { Finding, TargetKey } from '@/types.ts';

/** Bumped on any breaking change to the JSON shape. */
export const jsonReportVersion = 2;

/** The versions `parseJsonReport` reads. Version 1 has `entry` where version 2 has `entries`. */
const readableVersions: readonly number[] = [1, jsonReportVersion];

/** The parts of a `check --format json` report that other commands read back. */
export interface JsonReport {
  version: number;
  targets: { key: TargetKey; entries: string[]; findings: Finding[] }[];
  /** Targets left out because they have no entry. Empty in version 1 reports. */
  skipped: SkippedTarget[];
}

/** Keeps the `id` of a finding that has one. A report written before IDs existed has none. */
function withId(finding: Finding): Finding & { id: string } {
  return { id: findingId(finding), ...finding };
}

/** The targets that could not be checked, left out when there are none. */
export function failedJson(result: CheckResult): { failed?: FailedJson[] } {
  const failed = result.failed ?? [];
  return failed.length === 0 ? {} : { failed: failed.map(item => failedEntry(item)) };
}

function failedEntry({ key, message, hint }: FailedTarget): FailedJson {
  return hint === undefined ? { target: key, message } : { target: key, message, hint };
}

export interface FailedJson {
  target: TargetKey;
  message: string;
  hint?: string;
}

export function formatJson(result: CheckResult): string {
  const report = {
    version: jsonReportVersion,
    summary: countLevels(result),
    skipped: result.skipped,
    ...failedJson(result),
    targets: result.reports.map(targetReport => ({
      ...targetReport.target,
      entries: targetReport.entries,
      modules: targetReport.modules,
      ignored: targetReport.ignored,
      findings: targetReport.findings.map(withId),
      guarded: targetReport.guarded.map(withId),
      suppliedLoads: targetReport.suppliedLoads,
    })),
  };
  return `${JSON.stringify(report, null, 2)}\n`;
}

/** Version 1 names one `entry`, which version 2 lists as `entries`. */
function entriesOf(target: { entries?: unknown; entry?: unknown }): string[] {
  if (Array.isArray(target.entries)) {
    return target.entries.filter(entry => typeof entry === 'string');
  }
  return typeof target.entry === 'string' ? [target.entry] : [];
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
  if (!readableVersions.includes(value.version)) {
    throw new EdgefitError(
      `${source} has report version ${value.version}; this edgefit reads versions ${readableVersions.join(' and ')}.`,
      'Write both reports with the same edgefit version.',
    );
  }
  return {
    ...value,
    skipped: Array.isArray(value.skipped) ? value.skipped : [],
    targets: value.targets.map(target => ({
      key: target.key,
      entries: entriesOf(target),
      findings: target.findings.map(withId),
    })),
  };
}
