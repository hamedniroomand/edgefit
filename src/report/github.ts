import type { CheckResult } from '@/core/check.ts';
import type { Finding } from '@/types.ts';

import { chainLine, fixLine, ownerName, summaryLine } from './summary.ts';

// https://docs.github.com/actions/using-workflows/workflow-commands-for-github-actions
function escapeData(value: string): string {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function escapeProperty(value: string): string {
  return escapeData(value).replaceAll(':', '%3A').replaceAll(',', '%2C');
}

export function annotation(finding: Finding): string {
  const { file, line, column } = finding.location;
  const properties = [
    `file=${escapeProperty(file)}`,
    `line=${line}`,
    `col=${column}`,
    `title=${escapeProperty(`edgefit: ${finding.category} on ${finding.target}`)}`,
  ].join(',');
  const details = [finding.message, `in ${ownerName(finding)}`];
  if (finding.chain.length > 1) {
    details.push(`via ${chainLine(finding)}`);
  }
  const fix = fixLine(finding);
  if (fix !== undefined) {
    details.push(fix);
  }
  // The annotation does not show the finding's own source, so the fix's link is never a repeat.
  if (finding.suggestion !== undefined) {
    details.push(`why ${finding.suggestion.source}`);
  }
  return `::${finding.level} ${properties}::${escapeData(details.join('\n'))}`;
}

export function formatGithub(result: CheckResult): string {
  const lines = result.reports.flatMap(report =>
    report.findings.map(finding => annotation(finding)),
  );
  lines.push(`edgefit: ${summaryLine(result)}`);
  return `${lines.join('\n')}\n`;
}
