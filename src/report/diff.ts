import { findingKey } from '@/core/findings.ts';
import type { Finding, TargetKey } from '@/types.ts';

import type { JsonReport } from './json.ts';

export interface ReportDiff {
  /** The head report's targets. */
  targets: TargetKey[];
  /** Findings in the head report only. */
  added: Finding[];
  /** Findings in the base report only. */
  fixed: Finding[];
  /** Head findings that the base report also has. */
  unchanged: Finding[];
}

/** When `diff` exits with 1: on new error-level findings, on any in the head, or never. */
export type FailOn = 'new-errors' | 'errors' | 'never';

export const failOnValues: readonly FailOn[] = ['new-errors', 'errors', 'never'];

function findingsOf(report: JsonReport): Finding[] {
  return report.targets.flatMap(target => target.findings);
}

/** Matches findings on target, category, API and owner, so version bumps and moved lines do not count. */
export function diffReports(base: JsonReport, head: JsonReport): ReportDiff {
  const baseFindings = findingsOf(base);
  const headFindings = findingsOf(head);
  const baseKeys = new Set(baseFindings.map(finding => findingKey(finding)));
  const headKeys = new Set(headFindings.map(finding => findingKey(finding)));
  return {
    targets: head.targets.map(target => target.key),
    added: headFindings.filter(finding => !baseKeys.has(findingKey(finding))),
    fixed: baseFindings.filter(finding => !headKeys.has(findingKey(finding))),
    unchanged: headFindings.filter(finding => baseKeys.has(findingKey(finding))),
  };
}

export function diffFails(diff: ReportDiff, failOn: FailOn): boolean {
  const isError = (finding: Finding): boolean => finding.level === 'error';
  switch (failOn) {
    case 'new-errors': {
      return diff.added.some(isError);
    }
    case 'errors': {
      return diff.added.some(isError) || diff.unchanged.some(isError);
    }
    case 'never': {
      return false;
    }
    default: {
      throw new Error(`Unknown fail-on value: ${String(failOn)}`);
    }
  }
}
