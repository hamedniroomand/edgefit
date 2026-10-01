import { painter } from '@/report/text.ts';
import type { Paint } from '@/report/text.ts';

import type { PackageResult, PackageStatus } from './result.ts';

export const packagesGuideUrl = 'https://edgefit.kitdev.space/guide/packages';

export const statusSymbols: Record<PackageStatus, string> = {
  pass: '✓',
  warn: '⚠',
  fail: '✗',
  error: '?',
};

const statusColors: Record<PackageStatus, 'green' | 'yellow' | 'red' | 'gray'> = {
  pass: 'green',
  warn: 'yellow',
  fail: 'red',
  error: 'gray',
};

function cell(status: PackageStatus | undefined, width: number, paint: Paint): string {
  if (status === undefined) {
    return ''.padEnd(width);
  }
  const symbol = paint(statusColors[status], statusSymbols[status]);
  return `${symbol}${''.padEnd(width - 1)}`;
}

function gridLines(result: PackageResult, paint: Paint): string[] {
  const subpathWidth = Math.max(7, ...result.entries.map(entry => entry.subpath.length));
  const widths = result.targets.map(key => key.length);
  const row = (label: string, cells: string[]): string =>
    `${label.padEnd(subpathWidth)}  ${cells.join('  ')}`;
  return [
    row(
      'subpath',
      result.targets.map((key, i) => key.padEnd(widths[i] ?? 0)),
    ),
    ...result.entries.map(entry =>
      row(
        entry.subpath,
        result.targets.map((key, i) => cell(entry.results[key]?.status, widths[i] ?? 1, paint)),
      ),
    ),
    row(
      'overall',
      result.targets.map((key, i) => cell(result.summary[key], widths[i] ?? 1, paint)),
    ),
  ];
}

function problemLines(result: PackageResult, paint: Paint): string[] {
  const problems = result.entries.flatMap(entry =>
    result.targets.flatMap(key => {
      const found = entry.results[key];
      if (found === undefined || found.status === 'pass') {
        return [];
      }
      const plural = (count: number, word: string): string =>
        `${count} ${word}${count === 1 ? '' : 's'}`;
      const detail =
        found.status === 'error'
          ? `could not be checked: ${found.message ?? 'unknown error'}`
          : `${plural(found.errors, 'error')}, ${plural(found.warnings, 'warning')}`;
      return [`  ${entry.subpath} on ${key}: ${detail}`];
    }),
  );
  if (problems.length === 0) {
    return [];
  }
  return [
    '',
    ...problems,
    paint('dim', '  Run `edgefit check` on a project that imports it for the findings.'),
  ];
}

function footerLines(result: PackageResult, paint: Paint): string[] {
  const lines: string[] = [''];
  for (const key of result.targets) {
    const context = result.context[key];
    if (context !== undefined) {
      lines.push(
        paint('dim', `  ${key}: ${context.settings}`),
        ...context.notes.map(note => paint('yellow', `  note (${key}): ${note}`)),
      );
    }
  }
  lines.push(
    paint(
      'dim',
      `  A pass means a static check found no API the target lacks in code reachable from the entry, with every export used. The package was not run. Details: ${packagesGuideUrl}`,
    ),
  );
  return lines;
}

/** A subpath × target grid, then what the grid does and does not claim. */
export function formatPackageText(result: PackageResult, options: { color: boolean }): string {
  const paint = painter(options);
  const lines = [
    paint('bold', `edgefit · ${result.package}@${result.resolved}`),
    paint('dim', `  checked ${result.checkedAt.slice(0, 10)} with edgefit ${result.edgefit}`),
    '',
    ...gridLines(result, paint),
    ...problemLines(result, paint),
    ...footerLines(result, paint),
  ];
  return `${lines.join('\n')}\n`;
}
