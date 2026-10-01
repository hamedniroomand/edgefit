/** `web` holds Web API results from data not yet proven precise, so it defaults to a warning. */
export type Category = 'unsupported' | 'mocked' | 'mismatch' | 'web' | 'unknown';

export type Level = 'error' | 'warning' | 'off';

export type TargetKey = 'workerd' | 'bun' | 'deno' | 'deno-deploy';

/** The runtime a target runs code on. `deno` covers Deno Deploy too. */
export type Runtime = 'workerd' | 'bun' | 'deno';

/** Code that only runs when the runtime is (`present`) or is not (`!present`) `runtime`. */
export interface RuntimeCondition {
  runtime: Runtime;
  present: boolean;
}

/** A reference to a runtime API, such as `fs.watch` or the `process.binding` global. */
export interface ApiRef {
  /** The built-in module without the `node:` prefix (`fs`, `fs/promises`), or `*globals*` for globals. */
  module: string;
  /** Member path below the module, e.g. `['promises', 'watch']`. Empty for the module itself. */
  path: string[];
}

export interface Location {
  /** Path relative to the project root, with forward slashes. */
  file: string;
  line: number;
  column: number;
}

export interface PackageInfo {
  name: string;
  version: string | undefined;
}

export interface Usage {
  /** `mocked` marks a polyfill the build injected in place of the API, found through sourcemaps. */
  kind: 'api' | 'dynamic' | 'mocked';
  /** The API used. For dynamic usages this is the closest API edgefit could see, if any. */
  api: ApiRef | undefined;
  /** Human-readable name of what was used, e.g. `node:fs.watch` or `require(<expression>)`. */
  display: string;
  /** For dynamic and mocked usages: why the API could not be determined statically, or what replaced it. */
  reason?: string;
  location: Location;
  /** Set when the code only runs if the API exists, for example inside `if (x.y)`. */
  guarded?: true;
  /** Set when the code sits behind runtime checks, such as `typeof Deno !== 'undefined'`. All must hold. */
  runtimes?: RuntimeCondition[];
}

export interface Finding {
  category: Category;
  level: Exclude<Level, 'off'>;
  api: string;
  target: TargetKey;
  /** A full sentence, including the API. */
  message: string;
  /** What is wrong, without repeating the API. */
  detail: string;
  /** Owning package, or `undefined` for the project's own code. */
  package: PackageInfo | undefined;
  location: Location;
  /** Additional locations of the same API in the same package. */
  otherLocations: Location[];
  /** Import chain from the entry to the module, as display names. */
  chain: string[];
  /** Link to the curated source behind this result, when there is one. */
  source?: string;
  /** Set when the code only runs if the API exists, or on another runtime. Guarded findings never fail a check. */
  guarded?: true;
}

export interface IgnoreRule {
  /** Package name. Use `.` for the project's own code. */
  package?: string;
  /** API as shown in reports, e.g. `node:fs.watch`. A trailing `*` matches a prefix. */
  api?: string;
  reason?: string;
}

export interface WorkerdOptions {
  /** Defaults to the value in the wrangler config, then to the compatibility data's own settings. */
  compatibilityDate?: string;
  compatibilityFlags?: string[];
  /** Path to a wrangler config. Found automatically next to the project root when omitted. */
  wranglerConfig?: string | false;
}

export interface BunOptions {
  /** The Bun version to check for. Defaults to `packageManager: "bun@x"` or `.bun-version`. */
  version?: string;
}

export interface DenoOptions {
  /** Path to a `deno.json` or `deno.jsonc` for the import map. Found next to the project root when omitted. */
  configFile?: string | false;
}

export interface EdgefitConfig {
  targets?: TargetKey[];
  entry?: string;
  workerd?: WorkerdOptions;
  bun?: BunOptions;
  /** Used by both the `deno` and `deno-deploy` targets. */
  deno?: DenoOptions;
  ignore?: IgnoreRule[];
  levels?: Partial<Record<Category, Level>>;
  /** Extra export conditions to resolve with, before the target's own. */
  conditions?: string[];
}
