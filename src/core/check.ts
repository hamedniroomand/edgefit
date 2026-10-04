import path from 'node:path';
import process from 'node:process';

import { builtEntries, isBuildOutput } from '@/built/entry.ts';
import { missingPeersOf, resolveGraph } from '@/resolve/graph.ts';
import { createTarget } from '@/targets/index.ts';
import type { Target, TargetInfo } from '@/targets/index.ts';
import type { EdgefitConfig, Finding, TargetKey } from '@/types.ts';

import { entriesFor } from './entries.ts';
import type { TargetEntries } from './entries.ts';
import {
  collectFindings,
  collectSupported,
  defaultLevels,
  loadSuggestions,
  loadUnreached,
} from './findings.ts';
import type { SupportedApi } from './findings.ts';
import { shownModules, settleTargets } from './run-targets.ts';
import type { FailedTarget } from './run-targets.ts';
import { scanModules, toPosix } from './scan.ts';
import type { SuppliedLoad } from './scan.ts';

export type { FailedTarget } from './run-targets.ts';

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
  /** List an optional peer dependency that is not installed as `TargetReport.missingPeers`, not as a finding. */
  missingPeersAsNotes?: boolean;
  /** Name the exports of the package that the entry imports on a finding that only some of them reach, as `Finding.exports`. */
  byExport?: boolean;
}

export interface TargetReport {
  target: TargetInfo;
  entries: string[];
  modules: number;
  findings: Finding[];
  /** Findings in code that only runs when the API exists, kept out of `findings`. */
  guarded: Finding[];
  ignored: number;
  /** Empty unless `includeSupported` is set. */
  supported: SupportedApi[];
  /** The optional peer dependencies that are not installed, and that the code reaches. Only with `missingPeersAsNotes`. */
  missingPeers?: string[];
  /** Where the code loads a module that its user names. These are not findings. */
  suppliedLoads?: SuppliedLoad[];
}

/** A target left out of the run because it has no entry. */
export interface SkippedTarget {
  key: TargetKey;
  /** What the target looked at, so the user can see where an entry would be found. */
  searched: string[];
}

export interface CheckResult {
  root: string;
  reports: TargetReport[];
  skipped: SkippedTarget[];
  /** The targets that failed while others were checked. Left out when every target was checked. */
  failed?: FailedTarget[];
}

function describeNodeEnv(nodeEnv: string | undefined, fromConfig: boolean): string {
  if (nodeEnv === undefined) {
    return 'NODE_ENV not fixed, so both branches of a check are followed';
  }
  return `NODE_ENV ${nodeEnv} (${fromConfig ? 'from the config' : "as the platform's build"})`;
}

async function checkTarget(
  target: Target,
  { entries, source, notes: entryNotes, built }: TargetEntries,
  root: string,
  options: CheckOptions,
): Promise<TargetReport> {
  const config = options.config ?? {};
  const conditions = [...(config.conditions ?? []), ...target.info.conditions];
  const nodeEnv = config.env?.NODE_ENV ?? target.nodeEnv;
  const graph = await resolveGraph({
    root,
    entries,
    conditions,
    platform: target.resolvePlatform,
    nodeEnv,
    plugins: target.resolvePlugins,
  });
  const isBuilt = built || entries.some(entry => isBuildOutput(root, entry));
  const scanned = scanModules(graph, root, target.globals, {
    trace: !isBuilt,
    lazyNodeImports: target.lazyNodeImports,
    nodeEnv,
    leaveOutMissingPeers: options.missingPeersAsNotes,
    byExport: options.byExport,
  });
  const { modules, notes, supplied } = shownModules(scanned, root, isBuilt);
  const { findings, guarded, ignored } = collectFindings(modules, {
    target,
    levels: { ...defaultLevels, ...config.levels },
    ignore: config.ignore ?? [],
    suggestions: loadSuggestions(),
    unreached: loadUnreached(),
  });
  return {
    target: {
      ...target.info,
      settings: `${target.info.settings}, entries from ${source}, ${describeNodeEnv(nodeEnv, config.env?.NODE_ENV !== undefined)}`,
      conditions,
      notes: [...target.info.notes, ...entryNotes, ...notes],
    },
    entries: graph.entries.map(toPosix),
    modules: graph.modules.size,
    findings,
    guarded,
    ignored,
    supported: options.includeSupported === true ? collectSupported(modules, target) : [],
    suppliedLoads: supplied,
    ...(options.missingPeersAsNotes === true ? { missingPeers: missingPeersOf(graph) } : {}),
  };
}

/** Scans a project from its entry and reports runtime APIs each target does not fully support. */
export async function check(options: CheckOptions = {}): Promise<CheckResult> {
  const root = path.resolve(options.root ?? process.cwd());
  const config = options.config ?? {};
  const targets = (config.targets ?? ['workerd']).map(key => createTarget(key, root, config));
  const built = options.built;
  const entries: (TargetEntries | undefined)[] =
    built === undefined
      ? entriesFor(root, targets, config)
      : targets.map(() => ({ ...builtEntries(root, built), source: '--built', built: true }));
  const pending: { key: TargetKey; report: Promise<TargetReport> }[] = [];
  const skipped: SkippedTarget[] = [];
  for (const [index, target] of targets.entries()) {
    const own = entries[index];
    if (own === undefined) {
      skipped.push({ key: target.info.key, searched: target.entries.searched });
    } else {
      pending.push({ key: target.info.key, report: checkTarget(target, own, root, options) });
    }
  }
  const { reports, failed } = await settleTargets(pending);
  return { root, reports, skipped, ...(failed.length > 0 ? { failed } : {}) };
}

/** 2 when a target could not be checked, 1 when there are errors, else 0. */
export function exitCodeOf(result: CheckResult): number {
  if ((result.failed ?? []).length > 0) {
    return 2;
  }
  return countLevels(result).errors > 0 ? 1 : 0;
}

export function countLevels(result: CheckResult): { errors: number; warnings: number } {
  const findings = result.reports.flatMap(report => report.findings);
  return {
    errors: findings.filter(finding => finding.level === 'error').length,
    warnings: findings.filter(finding => finding.level === 'warning').length,
  };
}
