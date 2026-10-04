import type { CheckResult } from '@/core/check.ts';

import { compareRows } from './compare.ts';
import type { CompareOptions } from './compare.ts';
import { failedJson, jsonReportVersion } from './json.ts';

export function formatCompareJson(result: CheckResult, options: CompareOptions): string {
  const report = {
    version: jsonReportVersion,
    targets: result.reports.map(report => report.target.key),
    skipped: result.skipped,
    ...failedJson(result),
    apis: compareRows(result, options).map(({ api, packages, results }) => ({
      api,
      packages,
      results,
    })),
  };
  return `${JSON.stringify(report, null, 2)}\n`;
}
