import type { Target } from '@/targets/index.ts';
import type {
  Category,
  Finding,
  IgnoreRule,
  Level,
  PackageInfo,
  TargetKey,
  Usage,
} from '@/types.ts';

import { classify } from './classify.ts';

export const defaultLevels: Record<Category, Level> = {
  unsupported: 'error',
  mocked: 'error',
  mismatch: 'warning',
  web: 'warning',
  unknown: 'warning',
};

export interface ModuleUsages {
  file: string;
  package: PackageInfo | undefined;
  chain: string[];
  usages: Usage[];
}

export interface FindingOptions {
  target: Target;
  levels: Record<Category, Level>;
  ignore: readonly IgnoreRule[];
}

/** A reached API the target fully supports. */
export interface SupportedApi {
  api: string;
  /** Owning package, or `undefined` for the project's own code. */
  package: PackageInfo | undefined;
}

export interface FindingSet {
  findings: Finding[];
  /** Findings in code that only runs when the API exists. They never fail a check. */
  guarded: Finding[];
  ignored: number;
}

function matchesPattern(pattern: string | undefined, value: string): boolean {
  if (pattern === undefined) {
    return true;
  }
  return pattern.endsWith('*') ? value.startsWith(pattern.slice(0, -1)) : pattern === value;
}

function isIgnored(finding: Finding, rules: readonly IgnoreRule[]): boolean {
  const owner = finding.package?.name ?? '.';
  return rules.some(
    rule => matchesPattern(rule.package, owner) && matchesPattern(rule.api, finding.api),
  );
}

/**
 * Drops `node:fs` when the same file also has a finding for a member such as `node:fs.watch`,
 * so an unsupported module is not reported twice for one use.
 */
function withoutRedundantModules(findings: readonly Finding[]): Finding[] {
  return findings.filter(
    finding =>
      !findings.some(
        other =>
          other !== finding &&
          other.location.file === finding.location.file &&
          other.category === finding.category &&
          (other.guarded !== true || finding.guarded === true) &&
          other.api.startsWith(`${finding.api}.`),
      ),
  );
}

function toFinding(
  module: ModuleUsages,
  usage: Usage,
  options: FindingOptions,
): Finding | undefined {
  const classification = classify(usage, options.target);
  if (classification === undefined) {
    return undefined;
  }
  const level = options.levels[classification.category];
  if (level === 'off') {
    return undefined;
  }
  const target: TargetKey = options.target.info.key;
  return {
    category: classification.category,
    level,
    api: usage.display,
    target,
    message: `${usage.display} ${classification.detail}`,
    detail: classification.detail,
    package: module.package,
    location: usage.location,
    otherLocations: [],
    chain: module.chain,
    ...(classification.source === undefined ? {} : { source: classification.source }),
    // A check only protects code from an API the target lacks; one that exists and throws still fails.
    ...(usage.guarded === true && classification.absent ? { guarded: true as const } : {}),
  };
}

/**
 * Identifies a finding by its API and owner: the package name, or the file for the project's own
 * code. Versions and line numbers are left out, so a patch release keeps the same identity.
 */
export function findingKey(finding: Finding): string {
  const owner = finding.package?.name ?? finding.location.file;
  return `${finding.target}\0${finding.category}\0${finding.api}\0${owner}`;
}

/** Merges findings for the same API within one package (or one file of the project's own code). */
function group(findings: readonly Finding[]): Finding[] {
  const groups = new Map<string, Finding>();
  for (const finding of findings) {
    const key = findingKey(finding);
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, { ...finding, otherLocations: [] });
    } else {
      existing.otherLocations.push(finding.location);
    }
  }
  return [...groups.values()];
}

const levelOrder: Record<Finding['level'], number> = { error: 0, warning: 1 };

function compareFindings(left: Finding, right: Finding): number {
  return (
    levelOrder[left.level] - levelOrder[right.level] ||
    (left.package?.name ?? '').localeCompare(right.package?.name ?? '') ||
    left.location.file.localeCompare(right.location.file) ||
    left.location.line - right.location.line ||
    left.location.column - right.location.column
  );
}

export function collectFindings(
  modules: readonly ModuleUsages[],
  options: FindingOptions,
): FindingSet {
  const raw = modules.flatMap(module =>
    withoutRedundantModules(
      module.usages.flatMap(usage => toFinding(module, usage, options) ?? []),
    ),
  );
  const kept = raw.filter(finding => !isIgnored(finding, options.ignore));
  return {
    findings: group(kept.filter(finding => finding.guarded !== true)).toSorted(compareFindings),
    guarded: group(kept.filter(finding => finding.guarded === true)).toSorted(compareFindings),
    ignored: raw.length - kept.length,
  };
}

/** Reached APIs that produce no finding because the target supports them, once per package. */
export function collectSupported(modules: readonly ModuleUsages[], target: Target): SupportedApi[] {
  const supported = new Map<string, SupportedApi>();
  for (const module of modules) {
    for (const usage of module.usages) {
      const key = `${usage.display}\0${module.package?.name ?? '.'}`;
      if (usage.kind === 'api' && !supported.has(key) && classify(usage, target) === undefined) {
        supported.set(key, { api: usage.display, package: module.package });
      }
    }
  }
  return [...supported.values()];
}
