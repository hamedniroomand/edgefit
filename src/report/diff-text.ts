import type { Finding } from '@/types.ts';

import type { ReportDiff } from './diff.ts';
import { chainLine, fixLine, fixSourceLine, formatLocation, ownerName } from './summary.ts';
import { painter } from './text.ts';
import type { Paint, TextOptions } from './text.ts';

export function diffSummaryLine(diff: ReportDiff): string {
  return `${diff.added.length} new, ${diff.fixed.length} fixed, ${diff.unchanged.length} unchanged`;
}

function heading(diff: ReportDiff): string {
  if (diff.added.length > 0) {
    return '⚠ Runtime compatibility regression';
  }
  return diff.fixed.length > 0
    ? '✓ No new runtime compatibility findings'
    : '✓ No runtime compatibility changes';
}

function formatAdded(finding: Finding, paint: Paint): string {
  const label = paint(finding.level === 'error' ? 'red' : 'yellow', 'New:');
  const lines = [
    `${label} ${finding.message} ${paint('dim', `(${finding.target})`)}`,
    `  ${paint('cyan', ownerName(finding))} · ${formatLocation(finding.location)}`,
  ];
  if (finding.chain.length > 1) {
    lines.push(paint('dim', `  via ${chainLine(finding)}`));
  }
  const fix = fixLine(finding);
  if (fix !== undefined) {
    lines.push(`  ${paint('green', fix)}`);
  }
  const why = fixSourceLine(finding);
  if (why !== undefined) {
    lines.push(paint('dim', `  ${why}`));
  }
  return lines.join('\n');
}

function formatFixed(finding: Finding, paint: Paint): string {
  return [
    `${paint('green', 'Fixed:')} ${finding.message} ${paint('dim', `(${finding.target})`)}`,
    `  ${paint('cyan', ownerName(finding))}`,
  ].join('\n');
}

/** What changed between two reports, new findings first. */
export function formatDiffText(diff: ReportDiff, options: TextOptions): string {
  const paint = painter(options);
  const header = paint('bold', `${heading(diff)} · ${diff.targets.join(', ')}`);
  const blocks = [
    ...diff.added.map(finding => formatAdded(finding, paint)),
    ...diff.fixed.map(finding => formatFixed(finding, paint)),
  ];
  return [header, ...blocks, diffSummaryLine(diff)].join('\n\n').concat('\n');
}
