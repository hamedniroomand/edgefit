import type { ReportDiff } from './diff.ts';
import { jsonReportVersion } from './json.ts';

export function formatDiffJson(diff: ReportDiff): string {
  const report = {
    version: jsonReportVersion,
    targets: diff.targets,
    new: diff.added,
    fixed: diff.fixed,
    unchanged: diff.unchanged,
  };
  return `${JSON.stringify(report, null, 2)}\n`;
}
