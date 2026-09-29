import type { CheckResult } from '@/core/check.ts';

import { formatDiffGithub } from './diff-github.ts';
import { formatDiffJson } from './diff-json.ts';
import { formatDiffText } from './diff-text.ts';
import type { ReportDiff } from './diff.ts';
import { formatGithub } from './github.ts';
import { formatJson } from './json.ts';
import { formatText } from './text.ts';

export type ReportFormat = 'text' | 'json' | 'github';

export const reportFormats: readonly ReportFormat[] = ['text', 'json', 'github'];

export function isReportFormat(value: string): value is ReportFormat {
  return (reportFormats as readonly string[]).includes(value);
}

export function formatReport(
  result: CheckResult,
  format: ReportFormat,
  options: { color: boolean },
): string {
  switch (format) {
    case 'json': {
      return formatJson(result);
    }
    case 'github': {
      return formatGithub(result);
    }
    case 'text': {
      return formatText(result, options);
    }
    default: {
      throw new Error(`Unknown report format: ${String(format)}`);
    }
  }
}

export function formatDiff(
  diff: ReportDiff,
  format: ReportFormat,
  options: { color: boolean },
): string {
  switch (format) {
    case 'json': {
      return formatDiffJson(diff);
    }
    case 'github': {
      return formatDiffGithub(diff);
    }
    case 'text': {
      return formatDiffText(diff, options);
    }
    default: {
      throw new Error(`Unknown report format: ${String(format)}`);
    }
  }
}
