import type { CheckResult } from '@/core/check.ts';
import { describeEntries } from '@/core/entries.ts';

import { compareRows } from './compare.ts';
import type { CompareCell, CompareOptions, CompareRow } from './compare.ts';
import { summaryLine } from './summary.ts';
import { formatFinding, formatSkipped, painter } from './text.ts';
import type { Paint, TextOptions } from './text.ts';

export interface CompareTextOptions extends TextOptions, CompareOptions {
  /** List the findings behind each row. */
  verbose: boolean;
}

const symbols: Record<CompareCell | 'unreached', { symbol: string; style: Parameters<Paint>[0] }> =
  {
    supported: { symbol: '✓', style: 'green' },
    mismatch: { symbol: '~', style: 'yellow' },
    mocked: { symbol: '~', style: 'yellow' },
    web: { symbol: '!', style: 'yellow' },
    unsupported: { symbol: '✗', style: 'red' },
    unknown: { symbol: '?', style: 'yellow' },
    unreached: { symbol: '–', style: 'dim' },
  };

const legend =
  '✓ supported  ~ mismatch or mocked  ✗ unsupported  ! missing per Web API data  ? unknown  – not reached or ignored';

const gap = '  ';

function formatRow(
  row: CompareRow,
  keys: readonly string[],
  apiWidth: number,
  paint: Paint,
): string {
  const cells = keys.map(key => {
    const { symbol, style } =
      symbols[row.results[key as keyof CompareRow['results']] ?? 'unreached'];
    return paint(style, symbol) + ' '.repeat(key.length - symbol.length);
  });
  return [row.api.padEnd(apiWidth), ...cells].join(gap).trimEnd();
}

function formatVerbose(row: CompareRow, paint: Paint): string[] {
  const packages = paint('dim', `    reached by ${row.packages.join(', ')}`);
  const findings = row.findings.flatMap(finding =>
    formatFinding(finding, paint).map(line => `    ${line}`),
  );
  return [packages, ...findings];
}

/** The entries when every target checks the same ones, else each target's own. */
function compareHeader(result: CheckResult, entries: readonly string[], paint: Paint): string {
  const title = paint('bold', 'edgefit compare');
  if (new Set(entries).size <= 1) {
    return paint('bold', `edgefit compare · ${entries[0] ?? ''}`);
  }
  const perTarget = result.reports.map(
    (report, index) => `  ${report.target.key}: ${entries[index]}`,
  );
  return [title, ...perTarget.map(line => paint('dim', line))].join('\n');
}

/** One table of the reached APIs across targets. */
export function formatCompareText(result: CheckResult, options: CompareTextOptions): string {
  const paint = painter(options);
  const keys = result.reports.map(report => report.target.key);
  const entries = result.reports.map(report => describeEntries(report.entries));
  const header = compareHeader(result, entries, paint);
  const rows = compareRows(result, options);
  const notes = [
    ...result.reports.flatMap(report =>
      report.target.notes.map(note => paint('yellow', `note (${report.target.key}): ${note}`)),
    ),
    ...formatSkipped(result, paint),
  ];
  if (rows.length === 0) {
    const clean = paint('green', 'No known incompatible reachable APIs found.');
    return [header, '', clean, ...notes, '', summaryLine(result), ''].join('\n');
  }
  const apiWidth = Math.max(...rows.map(row => row.api.length));
  const heading = paint('dim', ['API'.padEnd(apiWidth), ...keys].join(gap));
  const rowBlocks = rows.map(row =>
    [formatRow(row, keys, apiWidth, paint)]
      .concat(options.verbose ? formatVerbose(row, paint) : [])
      .join('\n'),
  );
  // Verbose rows span several lines, so a blank line keeps them apart.
  const table = [heading, ...rowBlocks].join(options.verbose ? '\n\n' : '\n');
  return [header, '', table, '', paint('dim', legend), ...notes, '', summaryLine(result), ''].join(
    '\n',
  );
}
