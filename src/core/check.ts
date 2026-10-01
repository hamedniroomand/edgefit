import path from 'node:path';
import process from 'node:process';

import { attributeOutput } from '@/built/attribute.ts';
import { builtEntry, isBuildOutput } from '@/built/entry.ts';
import { EdgefitError } from '@/errors.ts';
import { resolveGraph } from '@/resolve/graph.ts';
import { createTarget } from '@/targets/index.ts';
import type { Target, TargetInfo } from '@/targets/index.ts';
import type { EdgefitConfig, Finding } from '@/types.ts';

import { collectFindings, collectSupported, defaultLevels, loadSuggestions } from './findings.ts';
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
  /** Findings in code that only runs when the API exists, kept out of `findings`. */
  guarded: Finding[];
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
    // A target that looked for an entry and found none or several says why, in its own terms.
    throw new EdgefitError(
      'No entry point to scan.',
      targets.find(target => target.entryHint !== undefined)?.entryHint ??
        'Pass --entry, set `entry` in edgefit.config.ts, or set `main` in the wrangler config.',
    );
  }
  return entry;
}

function describeNodeEnv(nodeEnv: string | undefined, fromConfig: boolean): string {
  if (nodeEnv === undefined) {
    return 'NODE_ENV not fixed, so both branches of a check are followed';
  }
  return `NODE_ENV ${nodeEnv} (${fromConfig ? 'from the config' : "as the platform's build"})`;
}

async function checkTarget(
  target: Target,
  entry: string,
  root: string,
  options: CheckOptions,
): Promise<TargetReport> {
  const config = options.config ?? {};
  const conditions = [...(config.conditions ?? []), ...target.info.conditions];
  const nodeEnv = config.env?.NODE_ENV ?? target.nodeEnv;
  const graph = await resolveGraph({
    root,
    entry,
    conditions,
    platform: target.resolvePlatform,
    nodeEnv,
    plugins: target.resolvePlugins,
  });
  const isBuilt = options.built !== undefined || isBuildOutput(root, entry);
  const scanned = scanModules(graph, root, target.globals, {
    trace: !isBuilt,
    lazyNodeImports: target.lazyNodeImports,
    nodeEnv,
  });
  const { modules, notes } = isBuilt
    ? attributeOutput(scanned, root)
    : { modules: scanned, notes: [] };

  const { findings, guarded, ignored } = collectFindings(modules, {
    target,
    levels: { ...defaultLevels, ...config.levels },
    ignore: config.ignore ?? [],
    suggestions: loadSuggestions(),
  });
  return {
    target: {
      ...target.info,
      settings: `${target.info.settings}, ${describeNodeEnv(nodeEnv, config.env?.NODE_ENV !== undefined)}`,
      conditions,
      notes: [...target.info.notes, ...notes],
    },
    entry: toPosix(graph.entry),
    modules: graph.modules.size,
    findings,
    guarded,
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
