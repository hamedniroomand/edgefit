import { styleText } from 'node:util';

import type { CheckResult, TargetReport } from '@/core/check.ts';
import type { Finding } from '@/types.ts';

import { chainLine, formatLocation, ownerName, summaryLine } from './summary.ts';

type Style = Parameters<typeof styleText>[0];

export type Paint = (style: Style, text: string) => string;

export interface TextOptions {
  color: boolean;
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
  const level = finding.level === 'error' ? paint('red', 'error  ') : paint('yellow', 'warning');
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

export function formatText(result: CheckResult, options: TextOptions): string {
  const paint = painter(options);
  const sections = result.reports.map(report => {
    const findings = report.findings.map(finding => formatFinding(finding, paint).join('\n'));
    const body =
      findings.length > 0
        ? findings.join('\n\n')
        : paint('green', 'No known incompatible reachable APIs found.');
    return `${formatHeader(report, paint).join('\n')}\n\n${body}`;
  });
  return `${sections.join('\n\n')}\n\n${summaryLine(result)}\n`;
}
