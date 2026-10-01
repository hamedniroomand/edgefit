import { readDataFile } from '@/data/data-directory.ts';
import { child } from '@/data/dump.ts';
import type { Dump, DumpNode } from '@/data/dump.ts';
import { findSource } from '@/data/manifest.ts';
import type { TargetKey } from '@/types.ts';

import type { CompatProvider, CompatTree } from './provider.ts';

interface AllowlistFile {
  /** Node built-ins that work: `true` for the whole module, or the members that do. */
  modules: Record<string, true | string[]>;
  /** Global names that exist. */
  globals: string[];
  /** ECMAScript builtins, which any V8 runtime has whether or not its docs list them. */
  languageGlobals: string[];
  /** Web globals the platform's own emulator has and its docs omit. */
  emulatorGlobals: string[];
  /** Globals that exist with only these members. */
  globalMembers: Record<string, string[]>;
}

const baselineFile = 'workers-nodejs-compat-matrix/baseline.json';
const globalsKey = '*globals*';

function withoutNodePrefix(dump: Dump): Dump {
  return Object.fromEntries(
    Object.entries(dump).map(([key, node]) => [key.replace(/^node:/u, ''), node]),
  );
}

/** A node keeping only `members`, at the top and below `default`, which is how modules are dumped. */
function pickMembers(node: DumpNode | undefined, members: readonly string[]): DumpNode {
  const keep = (source: DumpNode | undefined): Record<string, DumpNode> => {
    const kept: Record<string, DumpNode> = {};
    for (const key of ['*self*', ...members]) {
      const value = child(source, key);
      if (value !== undefined) {
        kept[key] = value;
      }
    }
    return kept;
  };
  const inner = child(node, 'default');
  return { ...keep(node), ...(inner === undefined ? {} : { default: keep(inner) }) };
}

/** The globals the list names, and for `globalMembers` only the members it keeps. */
function allowedGlobals(
  baseGlobals: DumpNode | undefined,
  allowed: AllowlistFile,
): Record<string, DumpNode> {
  const globals: Record<string, DumpNode> = {
    '*self*': child(baseGlobals, '*self*') ?? 'object',
  };
  for (const global of [
    ...allowed.globals,
    ...allowed.languageGlobals,
    ...allowed.emulatorGlobals,
  ]) {
    const node = child(baseGlobals, global);
    if (node !== undefined) {
      globals[global] = node;
    }
  }
  for (const [global, members] of Object.entries(allowed.globalMembers)) {
    const node = child(baseGlobals, global);
    if (node !== undefined) {
      globals[global] = pickMembers(node, members);
    }
  }
  return globals;
}

/**
 * The extractor reads the global `process` as the `process` module, so what the global has, the
 * module has: `process.env` is looked up there.
 */
function mirrorProcess(runtime: Dump, baseline: Dump, allowed: AllowlistFile): void {
  const members = allowed.globalMembers.process;
  if (members !== undefined && baseline.process !== undefined) {
    runtime.process = pickMembers(baseline.process, members);
  }
}

/**
 * A runtime with no dump of its own, described by what its docs allow: the Node baseline with
 * everything not listed removed. A module or global the list omits then reads as missing, so a
 * list that falls behind the platform under-reports support instead of over-reporting it.
 */
export function allowlistProvider(target: TargetKey): CompatProvider<CompatTree> {
  const name = `allowlist/${target}`;
  return {
    name,
    load: dataDirectory => {
      const source = findSource(dataDirectory, name);
      const allowed = readDataFile<AllowlistFile>(dataDirectory, `allowlists/${target}.json`);
      const baseline = withoutNodePrefix(readDataFile<Dump>(dataDirectory, baselineFile));

      const runtime: Dump = {};
      for (const [module, allow] of Object.entries(allowed.modules)) {
        const node = baseline[module];
        if (node !== undefined) {
          runtime[module] = allow === true ? node : pickMembers(node, allow);
        }
      }
      const globals = allowedGlobals(baseline[globalsKey], allowed);
      mirrorProcess(runtime, baseline, allowed);
      runtime[globalsKey] = globals;

      return {
        baseline,
        runtime,
        source: {
          provider: name,
          version: source.versions[target] ?? 'unknown',
          url: source.url,
        },
      };
    },
  };
}
