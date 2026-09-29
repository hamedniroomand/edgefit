import path from 'node:path';
import process from 'node:process';

import { attributeOutput } from '@/built/attribute.ts';
import { builtEntry } from '@/built/entry.ts';
import { EdgefitError } from '@/errors.ts';
import { resolveGraph } from '@/resolve/graph.ts';
import { createTarget } from '@/targets/index.ts';
import type { Target, TargetInfo } from '@/targets/index.ts';
import type { EdgefitConfig, Finding } from '@/types.ts';

import { collectFindings, collectSupported, defaultLevels } from './findings.ts';
import type { SupportedApi } from './findings.ts';
import { scanModules, toPosix } from './scan.ts';

export interface CheckOptions {
  /** Project root. Defaults to the current working directory. */
  root?: string;
  config?: EdgefitConfig;
  /**
   * Scan this build output instead of the source: its entry file, or the directory holding it.
   * Relative to the root.
   */
  built?: string;
  /** Also list the reached APIs each target supports, as `TargetReport.supported`. */
  includeSupported?: boolean;
}

export interface TargetReport {
  target: TargetInfo;
  entry: string;
  modules: number;
  findings: Finding[];
  ignored: number;
  /** Empty unless `includeSupported` is set. */
  supported: SupportedApi[];
}

export interface CheckResult {
  root: string;
  reports: TargetReport[];
}

/** One entry for every target, so a target without its own config can reuse wrangler's `main`. */
function entryFor(targets: readonly Target[], config: EdgefitConfig): string {
  const entry =
    config.entry ?? targets.find(target => target.defaultEntry !== undefined)?.defaultEntry;
  if (entry === undefined) {
    throw new EdgefitError(
      'No entry point to scan.',
      'Pass --entry, set `entry` in edgefit.config.ts, or set `main` in the wrangler config.',
    );
  }
  return entry;
}

async function checkTarget(
  target: Target,
  entry: string,
  root: string,
  options: CheckOptions,
): Promise<TargetReport> {
  const config = options.config ?? {};
  const conditions = [...(config.conditions ?? []), ...target.info.conditions];
  const graph = await resolveGraph({
    root,
    entry,
    conditions,
    platform: target.resolvePlatform,
    plugins: target.resolvePlugins,
  });
  const scanned = scanModules(graph, root, target.globals);
  const { modules, notes } =
    options.built === undefined ? { modules: scanned, notes: [] } : attributeOutput(scanned, root);

  const { findings, ignored } = collectFindings(modules, {
    target,
    levels: { ...defaultLevels, ...config.levels },
    ignore: config.ignore ?? [],
  });
  return {
    target: { ...target.info, conditions, notes: [...target.info.notes, ...notes] },
    entry: toPosix(graph.entry),
    modules: graph.modules.size,
    findings,
    ignored,
    supported: options.includeSupported === true ? collectSupported(modules, target) : [],
  };
}

/** Scans a project from its entry and reports runtime APIs each target does not fully support. */
export async function check(options: CheckOptions = {}): Promise<CheckResult> {
  const root = path.resolve(options.root ?? process.cwd());
  const config = options.config ?? {};
  const targets = (config.targets ?? ['workerd']).map(key => createTarget(key, root, config));
  const entry =
    options.built === undefined ? entryFor(targets, config) : builtEntry(root, options.built);
  const pending: Promise<TargetReport>[] = [];
  for (const target of targets) {
    pending.push(checkTarget(target, entry, root, options));
  }
  const reports = await Promise.all(pending);
  return { root, reports };
}

export function countLevels(result: CheckResult): { errors: number; warnings: number } {
  const findings = result.reports.flatMap(report => report.findings);
  return {
    errors: findings.filter(finding => finding.level === 'error').length,
    warnings: findings.filter(finding => finding.level === 'warning').length,
  };
}
