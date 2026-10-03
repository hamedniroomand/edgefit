import { findSuggestion } from '@/data/suggestions.ts';
import type { SuggestionData } from '@/data/suggestions.ts';
import { findUnreached } from '@/data/unreached.ts';
import type { UnreachedEntry } from '@/data/unreached.ts';
import type { Target } from '@/targets/index.ts';
import type {
  Category,
  Finding,
  IgnoreRule,
  Level,
  PackageInfo,
  Suggestion,
  TargetKey,
  Usage,
} from '@/types.ts';

import { classify } from './classify.ts';
import type { Classification } from './classify.ts';

/** Re-exported so the check reads the shipped suggestions through the same module that applies them. */
export { loadSuggestions } from '@/data/suggestions.ts';
export { loadUnreached } from '@/data/unreached.ts';

export const defaultLevels: Record<Category, Level> = {
  unsupported: 'error',
  mocked: 'error',
  mismatch: 'warning',
  web: 'warning',
  unknown: 'warning',
};

/** Whether the runtime checks around a usage rule out the target's runtime, so the code never runs on it. */
function isOtherRuntime(usage: Usage, target: Target): boolean {
  return (
    usage.runtimes?.some(({ runtime, present }) => target.runtimes.includes(runtime) !== present) ??
    false
  );
}

/** Whether a module is only stored in a global that the target already has, so the store never runs. */
function isShadowedPolyfill(usage: Usage, target: Target): boolean {
  const [name] = usage.polyfill?.path ?? [];
  return (
    usage.polyfill !== undefined &&
    name !== undefined &&
    target.hasGlobal(name) &&
    target.lookup(usage.polyfill).status === 'supported'
  );
}

export interface ModuleUsages {
  file: string;
  package: PackageInfo | undefined;
  /** The code is build output with no original file in the project: see `Finding.buildOutput`. */
  buildOutput?: true;
  chain: string[];
  usages: Usage[];
}

export interface FindingOptions {
  target: Target;
  levels: Record<Category, Level>;
  ignore: readonly IgnoreRule[];
  /** Reviewed fixes for packages and APIs. Findings get none without them. */
  suggestions?: SuggestionData;
  /** Cases of code a package ships that the target never runs. Matching findings are guarded. */
  unreached?: readonly UnreachedEntry[];
}

/** A reached API the target fully supports. */
export interface SupportedApi {
  api: string;
  /** Owning package, or `undefined` for the project's own code. */
  package: PackageInfo | undefined;
  buildOutput?: true;
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
 * so an unsupported module is not reported twice for one use. A guarded member hides the module
 * only when the module is unknown, because the data says nothing about either.
 */
function withoutRedundantModules(findings: readonly Finding[]): Finding[] {
  return findings.filter(
    finding =>
      !findings.some(
        other =>
          other !== finding &&
          other.location.file === finding.location.file &&
          other.category === finding.category &&
          (other.guarded !== true || finding.guarded === true || finding.category === 'unknown') &&
          other.api.startsWith(`${finding.api}.`),
      ),
  );
}

/**
 * A change to a setting comes first, because it is the smallest change. Then the reviewed fix for
 * the package or API. A warning that something cannot be checked has nothing to fix.
 */
function suggest(
  module: ModuleUsages,
  usage: Usage,
  classification: Classification,
  options: FindingOptions,
): Suggestion | undefined {
  const target = options.target.info.key;
  if (classification.suggestion !== undefined) {
    return { ...classification.suggestion, target };
  }
  if (classification.category === 'unknown' || options.suggestions === undefined) {
    return undefined;
  }
  return findSuggestion(options.suggestions, {
    api: usage.display,
    package: module.package?.name,
    target,
  });
}

function unreachedFor(
  module: ModuleUsages,
  usage: Usage,
  options: FindingOptions,
): UnreachedEntry | undefined {
  const version = module.package?.version;
  if (options.unreached === undefined || module.package === undefined || version === undefined) {
    return undefined;
  }
  return findUnreached(options.unreached, {
    package: module.package.name,
    version,
    file: usage.location.file,
    api: usage.display,
    target: options.target.info.key,
  });
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
  const unreached = unreachedFor(module, usage, options);
  const guarded =
    (usage.guarded === true &&
      (classification.absent || (usage.kind === 'api' && classification.category === 'unknown'))) ||
    isOtherRuntime(usage, options.target) ||
    isShadowedPolyfill(usage, options.target) ||
    unreached !== undefined;
  const suggestion = guarded ? undefined : suggest(module, usage, classification, options);
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
    ...(suggestion === undefined ? {} : { suggestion }),
    // A check only protects code from an API the target lacks, or may lack when the data does not say.
    // One that exists and throws still fails.
    // Code that only runs on another runtime is never reached, whatever it uses.
    ...(guarded ? { guarded: true as const } : {}),
    ...(unreached === undefined
      ? {}
      : { unreached: { reason: unreached.reason, source: unreached.source } }),
    ...(module.buildOutput === true ? { buildOutput: true as const } : {}),
  };
}

/**
 * Identifies a finding by its API and owner: the package name, or the file for the project's own
 * code. Versions and line numbers are left out, so a patch release keeps the same identity.
 * Build output has no file of the project, and its chunk names change with every build.
 */
export function findingKey(finding: Finding): string {
  const owner =
    finding.package?.name ??
    (finding.buildOutput === true ? 'build output' : finding.location.file);
  return `${finding.target}\0${finding.category}\0${finding.api}\0${owner}`;
}

/** Merges findings for the same API within one owner: a package, a file of the project's own code, or build output. */
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
        supported.set(key, {
          api: usage.display,
          package: module.package,
          ...(module.buildOutput === true ? { buildOutput: true as const } : {}),
        });
      }
    }
  }
  return [...supported.values()];
}
