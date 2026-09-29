import { styleText } from 'node:util';

import type { CheckResult, TargetReport } from '@/core/check.ts';
import type { Finding } from '@/types.ts';

import { chainLine, formatLocation, ownerName, summaryLine } from './summary.ts';

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
      `  entry ${report.entry} · ${report.modules} modules · conditions ${target.conditions.join(', ')}`,
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
  if (finding.source !== undefined) {
    lines.push(paint('dim', `${indent}see ${finding.source}`));
  }
  return lines;
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
        `${count} guarded ${count === 1 ? 'usage' : 'usages'} hidden: the code checks for an API this target lacks. Run with --verbose to list them.`,
      ),
    ];
  }
  return [
    paint(
      'dim',
      'Guarded: the code checks for an API this target lacks before using it, so these do not fail a check.',
    ),
    ...report.guarded.map(finding => formatFinding(finding, paint).join('\n')),
  ];
}

export function formatText(result: CheckResult, options: TextOptions): string {
  const paint = painter(options);
  const sections = result.reports.map(report => {
    const findings = report.findings.map(finding => formatFinding(finding, paint).join('\n'));
    const body =
      findings.length > 0
        ? findings.join('\n\n')
        : paint('green', 'No known incompatible reachable APIs found.');
    const guarded = formatGuarded(report, paint, options.verbose === true);
    const tail = guarded.length > 0 ? `\n\n${guarded.join('\n\n')}` : '';
    return `${formatHeader(report, paint).join('\n')}\n\n${body}${tail}`;
  });
  return `${sections.join('\n\n')}\n\n${summaryLine(result)}\n`;
}
