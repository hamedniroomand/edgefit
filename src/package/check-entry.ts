import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { check } from '@/core/check.ts';
import type { TargetReport } from '@/core/check.ts';
import type { EdgefitConfig, TargetKey } from '@/types.ts';

import { entrySource } from './entry.ts';
import type { PackageEntry } from './entry.ts';
import { resultsByExport } from './exports.ts';
import { statusOf } from './result.ts';
import type { EntryStatus, PackageEntryResult, PackageResult } from './result.ts';
import { neededMessage, undeclaredModules } from './unchecked.ts';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function entryStatus(report: TargetReport): EntryStatus {
  const staying = report.findings.filter(finding => finding.exports === undefined);
  const errors = staying.filter(finding => finding.level === 'error').length;
  const warnings = staying.length - errors;
  const exports = resultsByExport(report.findings);
  const notes = [
    ...(report.missingPeers ?? []).map(
      name => `peer ${name} not installed, checked in your project`,
    ),
    ...(report.suppliedLoads ?? []).map(({ place }) => `loads a module the user names (${place})`),
  ];
  return {
    status: statusOf(errors, warnings),
    errors,
    warnings,
    ...(exports.length > 0 ? { exports } : {}),
    ...(notes.length > 0 ? { notes } : {}),
  };
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
    const checked = await check({ root, config, missingPeersAsNotes: true, byExport: true });
    for (const report of checked.reports) {
      row.results[report.target.key] = entryStatus(report);
      context[report.target.key] ??= {
        settings: report.target.settings,
        notes: [...report.target.notes],
      };
    }
  } catch (error) {
    const needed = undeclaredModules(error, root);
    const outcome: EntryStatus =
      needed.length > 0
        ? { status: 'unchecked', errors: 0, warnings: 0, message: neededMessage(needed) }
        : { status: 'error', errors: 0, warnings: 0, message: errorMessage(error) };
    for (const key of targets) {
      row.results[key] = outcome;
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
