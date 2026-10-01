import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { check } from '@/core/check.ts';
import type { EdgefitConfig, TargetKey } from '@/types.ts';

import { entrySource } from './entry.ts';
import type { PackageEntry } from './entry.ts';
import { statusOf } from './result.ts';
import type { PackageEntryResult, PackageResult } from './result.ts';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function checkEntry(
  root: string,
  entry: PackageEntry,
  index: number,
  targets: readonly TargetKey[],
  context: PackageResult['context'],
): Promise<PackageEntryResult> {
  const file = `entry-${index}.mjs`;
  await mkdir(path.join(root, '.edgefit'), { recursive: true });
  await writeFile(path.join(root, '.edgefit', file), entrySource(entry.specifier));
  const row: PackageEntryResult = {
    subpath: entry.subpath,
    specifier: entry.specifier,
    results: {},
  };
  const config: EdgefitConfig = {
    targets: [...targets],
    entry: `.edgefit/${file}`,
    workerd: { wranglerConfig: false },
    deno: { configFile: false },
  };
  try {
    const checked = await check({ root, config });
    for (const report of checked.reports) {
      const errors = report.findings.filter(finding => finding.level === 'error').length;
      const warnings = report.findings.length - errors;
      row.results[report.target.key] = { status: statusOf(errors, warnings), errors, warnings };
      context[report.target.key] ??= {
        settings: report.target.settings,
        notes: [...report.target.notes],
      };
    }
  } catch (error) {
    for (const key of targets) {
      row.results[key] = { status: 'error', errors: 0, warnings: 0, message: errorMessage(error) };
    }
  }
  return row;
}

/** One at a time: each check resolves and scans the whole graph, and memory is the limit. */
export async function inSequence(
  entries: readonly PackageEntry[],
  run: (entry: PackageEntry, index: number) => Promise<PackageEntryResult>,
): Promise<PackageEntryResult[]> {
  const rows: PackageEntryResult[] = [];
  for (const [index, entry] of entries.entries()) {
    // eslint-disable-next-line no-await-in-loop -- sequential on purpose
    rows.push(await run(entry, index));
  }
  return rows;
}
