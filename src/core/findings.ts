import { memberPath } from '@/data/compat-index.ts';
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

import { classify, dependsOnOptions } from './classify.ts';
import type { Classification } from './classify.ts';
import { group } from './finding-groups.ts';
import {
  isAfterMissingModule,
  isOtherGlobal,
  isOtherRuntime,
  isShadowedPolyfill,
} from './target-branches.ts';

/** Re-exported so the check reads the shipped suggestions through the same module that applies them. */
export { loadSuggestions } from '@/data/suggestions.ts';
export { loadUnreached } from '@/data/unreached.ts';
export { readStoredModules } from './stored-modules.ts';
export { findingKey } from './finding-groups.ts';

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
 * so an unsupported module is not reported twice for one use. A guarded member hides an unknown
 * module, because the data says nothing about either. It does not hide an unknown member, such as
 * `v8.startupSnapshot`, because a use of that member can throw or pass the member on.
 */
function withoutRedundantModules(
  findings: readonly Finding[],
  moduleRoots: ReadonlySet<Finding>,
): Finding[] {
  return findings.filter(
    finding =>
      !findings.some(
        other =>
          other !== finding &&
          other.location.file === finding.location.file &&
          other.category === finding.category &&
          (other.guarded !== true ||
            finding.guarded === true ||
            (finding.category === 'unknown' && moduleRoots.has(finding))) &&
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

/** Whether the code only runs if the API exists, or on another runtime, or with an option the project does not set. */
function isGuarded(
  usage: Usage,
  classification: Classification,
  target: Target,
  unreached: boolean,
): boolean {
  return (
    // A `catch` that does not throw again takes the throw of an API that exists and fails.
    (usage.caught === true && classification.category === 'unsupported') ||
    (usage.guarded === true &&
      (classification.absent || (usage.kind === 'api' && classification.category === 'unknown'))) ||
    isAfterMissingModule(usage, target) ||
    isOtherRuntime(usage, target) ||
    isOtherGlobal(usage, target) ||
    isShadowedPolyfill(usage, target) ||
    usage.options !== undefined ||
    unreached
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
  const unreached = unreachedFor(module, usage, options);
  const guarded = isGuarded(usage, classification, options.target, unreached !== undefined);
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
    ...(usage.options === undefined ? {} : { options: usage.options }),
    ...(unreached === undefined
      ? {}
      : { unreached: { reason: unreached.reason, source: unreached.source } }),
    ...(usage.exports === undefined ? {} : { exports: usage.exports }),
    ...(module.buildOutput === true ? { buildOutput: true as const } : {}),
  };
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
  const raw = modules.flatMap(module => {
    const moduleRoots = new Set<Finding>();
    const findings = module.usages.flatMap(usage => {
      const finding = toFinding(module, usage, options);
      if (finding !== undefined && usage.api !== undefined && memberPath(usage.api).length === 0) {
        moduleRoots.add(finding);
      }
      return finding ?? [];
    });
    return withoutRedundantModules(findings, moduleRoots);
  });
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
      if (
        usage.kind === 'api' &&
        !supported.has(key) &&
        !dependsOnOptions(usage, target) &&
        classify(usage, target) === undefined
      ) {
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
