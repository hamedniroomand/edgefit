import { styleText } from 'node:util';

import type { CheckResult, SkippedTarget, TargetReport } from '@/core/check.ts';
import { describeEntries } from '@/core/entries.ts';
import type { Finding } from '@/types.ts';

import {
  chainLine,
  fixLine,
  fixSourceLine,
  formatLocation,
  ownerName,
  skippedMessage,
  summaryLine,
} from './summary.ts';

type Style = Parameters<typeof styleText>[0];

export type Paint = (style: Style, text: string) => string;

export interface TextOptions {
  color: boolean;
  /** Also list the findings in code that checks for the API first. */
  verbose?: boolean;
}

const indent = '       ';

export function painter(options: TextOptions): Paint {
  return (style, text) =>
    options.color ? styleText(style, text, { validateStream: false }) : text;
}

function formatHeader(report: TargetReport, paint: Paint): string[] {
  const { target } = report;
  const lines = [
    paint('bold', `edgefit · ${target.key} (${target.platform})`),
    paint(
      'dim',
      `  ${describeEntries(report.entries)} · ${report.modules} modules · conditions ${target.conditions.join(', ')}`,
    ),
    paint('dim', `  data ${target.data}`),
    paint('dim', `  settings ${target.settings}`),
  ];
  for (const note of target.notes) {
    lines.push(paint('yellow', `  note: ${note}`));
  }
  return lines;
}

export function formatFinding(finding: Finding, paint: Paint): string[] {
  let level = finding.level === 'error' ? paint('red', 'error  ') : paint('yellow', 'warning');
  if (finding.guarded === true) {
    level = paint('dim', 'guarded');
  }
  const more =
    finding.otherLocations.length > 0
      ? paint('dim', `  (+${finding.otherLocations.length} more)`)
      : '';
  const lines = [
    `${level}  ${paint('bold', finding.category)}  ${finding.api}  ${paint('dim', `(${finding.target})`)}`,
    `${indent}${finding.detail}`,
    `${indent}${paint('cyan', ownerName(finding))}  ${formatLocation(finding.location)}${more}`,
  ];
  if (finding.chain.length > 1) {
    lines.push(paint('dim', `${indent}via ${chainLine(finding)}`));
  }
  const fix = fixLine(finding);
  if (fix !== undefined) {
    lines.push(`${indent}${paint('green', fix)}`);
  }
  const why = fixSourceLine(finding);
  if (why !== undefined) {
    lines.push(paint('dim', `${indent}${why}`));
  }
  if (finding.source !== undefined) {
    lines.push(paint('dim', `${indent}see ${finding.source}`));
  }
  if (finding.unreached !== undefined) {
    lines.push(
      paint('dim', `${indent}not reached: ${finding.unreached.reason}`),
      paint('dim', `${indent}see ${finding.unreached.source}`),
    );
  }
  return lines;
}

function isFoldable(finding: Finding): boolean {
  return finding.category === 'unknown' && finding.level === 'warning';
}

/** One line per package for warnings that only say something cannot be checked. */
function formatUnknown(findings: readonly Finding[], paint: Paint): string[] {
  const byOwner = new Map<string, Finding[]>();
  for (const finding of findings) {
    const owner = ownerName(finding);
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), finding]);
  }
  const lines = [...byOwner].map(([owner, group]) => {
    const counts = new Map<string, number>();
    for (const finding of group) {
      counts.set(finding.api, (counts.get(finding.api) ?? 0) + 1 + finding.otherLocations.length);
    }
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
    const apis = [...counts].map(([api, count]) => `${api} (${count})`).join(', ');
    return `${paint('yellow', 'warning')}  ${paint('bold', 'unknown')}  ${paint('cyan', owner)}  ${total} ${total === 1 ? 'access' : 'accesses'} that cannot be checked: ${apis}`;
  });
  return [...lines, paint('dim', `${indent}Run with --verbose for the locations.`)];
}

function formatGuarded(report: TargetReport, paint: Paint, verbose: boolean): string[] {
  if (report.guarded.length === 0) {
    return [];
  }
  if (!verbose) {
    const count = report.guarded.length;
    return [
      paint(
        'dim',
        `${count} guarded ${count === 1 ? 'usage' : 'usages'} hidden: the code checks for what this target lacks, or does not run on it. Run with --verbose to list them.`,
      ),
    ];
  }
  return [
    paint(
      'dim',
      'Guarded: the code checks for an API this target lacks before using it, catches the error of its absence, only runs on another runtime, or is listed as not reached, so these do not fail a check.',
    ),
    ...report.guarded.map(finding => formatFinding(finding, paint).join('\n')),
  ];
}

/** One line for each target left out because it has no entry. */
export function formatSkipped(skipped: readonly SkippedTarget[], paint: Paint): string[] {
  return skipped.map(target =>
    paint('yellow', `edgefit · ${target.key} skipped: ${skippedMessage(target)}`),
  );
}

export function formatText(result: CheckResult, options: TextOptions): string {
  const paint = painter(options);
  const sections = result.reports.map(report => {
    const verbose = options.verbose === true;
    const folded = verbose ? [] : report.findings.filter(finding => isFoldable(finding));
    const shown = report.findings.filter(finding => verbose || !isFoldable(finding));
    const blocks = shown.map(finding => formatFinding(finding, paint).join('\n'));
    if (folded.length > 0) {
      blocks.push(formatUnknown(folded, paint).join('\n'));
    }
    const body =
      blocks.length > 0
        ? blocks.join('\n\n')
        : paint('green', 'No known incompatible reachable APIs found.');
    const guarded = formatGuarded(report, paint, verbose);
    const tail = guarded.length > 0 ? `\n\n${guarded.join('\n\n')}` : '';
    return `${formatHeader(report, paint).join('\n')}\n\n${body}${tail}`;
  });
  const skipped = formatSkipped(result.skipped, paint);
  const all = [...sections, ...(skipped.length > 0 ? [skipped.join('\n')] : [])];
  return `${all.join('\n\n')}\n\n${summaryLine(result)}\n`;
}
