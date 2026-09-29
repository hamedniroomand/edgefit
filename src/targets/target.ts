import type { Plugin } from 'esbuild';

import type { LookupResult } from '@/data/dump.ts';
import type { ApiRef, TargetKey } from '@/types.ts';

export interface TargetInfo {
  key: TargetKey;
  platform: string;
  /** Export conditions packages are resolved with. */
  conditions: readonly string[];
  /** Where the compatibility data comes from and which version it describes. */
  data: string;
  /** The runtime settings results were computed for, and where they came from. */
  settings: string;
  notes: readonly string[];
}

export interface Target {
  readonly info: TargetInfo;
  /** How packages are resolved: `browser` applies `browser` fields, `node` does not. */
  readonly resolvePlatform: 'browser' | 'node';
  /** esbuild plugins for specifiers only this target understands, such as Deno's `npm:`. */
  readonly resolvePlugins?: readonly Plugin[];
  /** An entry point the target's own config declares, such as wrangler's `main`. */
  readonly defaultEntry: string | undefined;
  /** Global names worth tracking because something at or below them is not fully supported. */
  readonly globals: ReadonlySet<string>;
  lookup: (api: ApiRef) => LookupResult;
  hasProblemsBelow: (api: ApiRef) => boolean;
}
