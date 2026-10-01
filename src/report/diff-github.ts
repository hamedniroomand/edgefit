import { diffSummaryLine } from './diff-text.ts';
import type { ReportDiff } from './diff.ts';
import { annotation, skippedWarning } from './github.ts';

/** Annotations for new findings only, since the others were already there before the change. */
export function formatDiffGithub(diff: ReportDiff): string {
  const lines = diff.added.map(finding => annotation(finding));
  lines.push(
    ...diff.skipped.map(target => skippedWarning(target)),
    `edgefit: ${diffSummaryLine(diff)}`,
  );
  return `${lines.join('\n')}\n`;
}
