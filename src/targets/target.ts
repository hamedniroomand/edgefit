import type { Plugin } from 'esbuild';

import type { LookupResult } from '@/data/dump.ts';
import type { EntryDetection } from '@/targets/entries.ts';
import type { ApiRef, Runtime, TargetKey } from '@/types.ts';

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
  /** Every runtime the target is at once, for code behind a runtime check: Netlify Edge is Deno and Netlify. */
  readonly runtimes: readonly Runtime[];
  /** How packages are resolved: `browser` applies `browser` fields, `node` does not. */
  readonly resolvePlatform: 'browser' | 'node';
  /** esbuild plugins for specifiers only this target understands, such as Deno's `npm:`. */
  readonly resolvePlugins?: readonly Plugin[];
  /** What the platform's build replaces `process.env.NODE_ENV` with, or `undefined` when it sets none. */
  readonly nodeEnv: string | undefined;
  /** Where the target finds entries without `--entry`, and where it looked. */
  readonly entries: EntryDetection;
  /**
   * The platform's build replaces a Node.js module it lacks with a stand-in that only throws when
   * something from it is used, so importing one is harmless. Then a use is what fails, not the import.
   */
  readonly lazyNodeImports?: boolean | undefined;
  /** Global names worth tracking because something at or below them is not fully supported. */
  readonly globals: ReadonlySet<string>;
  lookup: (api: ApiRef) => LookupResult;
  hasProblemsBelow: (api: ApiRef) => boolean;
}
