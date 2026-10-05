/** `web` holds Web API results from data not yet proven precise, so it defaults to a warning. */
export type Category = 'unsupported' | 'mocked' | 'mismatch' | 'web' | 'unknown';

export type Level = 'error' | 'warning' | 'off';

export type TargetKey = 'workerd' | 'bun' | 'deno' | 'deno-deploy' | 'netlify-edge' | 'vercel-edge';

/** A runtime code can check for. A target runs on one or more: Netlify Edge is `deno` and `netlify`. */
export type Runtime = 'workerd' | 'bun' | 'deno' | 'netlify' | 'vercel-edge';

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
  /**
   * Set on a `process` reference that came from the global, not from importing `node:process`.
   * Most runtimes expose both the same way. Vercel's Edge runtime has only the global.
   */
  global?: true;
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
  kind: 'api' | 'dynamic' | 'mocked' | 'native';
  /** The API used. For dynamic usages this is the closest API edgefit could see, if any. */
  api: ApiRef | undefined;
  /** Human-readable name of what was used, e.g. `node:fs.watch` or `require(<expression>)`. */
  display: string;
  /** For dynamic and mocked usages: why the API could not be determined statically, or what replaced it. */
  reason?: string;
  location: Location;
  /** Set for a dynamic usage that is an export of a name bound to the API. */
  exported?: true;
  /** Set for a `require()` or `import()` of a name that the user of the function gives, such as a parameter. */
  supplied?: true;
  /** Set when a `try` with a `catch` that does not throw again stops the error of this use, and no check guards it. */
  caught?: true;
  /**
   * Set when the code runs only after a load of this API's module, in a `try` whose `catch` stops
   * the error of a missing module. It guards the use only on a target that lacks the whole module.
   */
  afterLoad?: true;
  /** The exports of the checked package that reach this usage, when only some of them do. Set with `byExport`. */
  exports?: string[];
  /** Set when the code only runs if the API exists, for example inside `if (x.y)`. */
  guarded?: true;
  /** Set when the code sits behind runtime checks, such as `typeof Deno !== 'undefined'`. All must hold. */
  runtimes?: RuntimeCondition[];
  /** Set when the value is stored in this global only if the global is missing. */
  polyfill?: ApiRef;
}

/** How to get rid of a finding: swap a package, change a setting, or change code or config. */
export interface Suggestion {
  kind: 'replace' | 'setting' | 'change';
  /** One sentence telling the user what to do. */
  text: string;
  /** For `replace`: the package to use instead. */
  package?: string;
  /**
   * For `setting`: the exact key and value, such as `compatibility_date` and `2025-09-15`.
   * With `remove`, the value is to be taken out of the setting, as `no_nodejs_compat` is.
   */
  setting?: { name: string; value: string; remove?: true };
  target: TargetKey;
  /** Where the fix is documented or verified. */
  source: string;
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
  /** What to do about it, when edgefit knows. Never set on guarded findings. */
  suggestion?: Suggestion;
  /** The exports of the checked package that reach this finding, when only some of them do. Set with `byExport`. */
  exports?: string[];
  /** Set when the code only runs if the API exists, or on another runtime. Guarded findings never fail a check. */
  guarded?: true;
  /** Set on a guarded finding that edgefit's data says is not reached on the target, with why. */
  unreached?: { reason: string; source: string };
  /**
   * Set when the code is in build output that no sourcemap maps to a file of the project, such as
   * the code a bundler adds around your modules. It has no owner, and is not your code.
   */
  buildOutput?: true;
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

export interface NetlifyOptions {
  /** Path to a `netlify.toml`. Found next to the project root when omitted. */
  configFile?: string | false;
}

export interface EnvOptions {
  /** What `process.env.NODE_ENV` is replaced with. Default `production`. */
  NODE_ENV?: string;
}

export interface EdgefitConfig {
  targets?: TargetKey[];
  /** One entry, or several. Globs are allowed. Applies to every target. */
  entry?: string | string[];
  workerd?: WorkerdOptions;
  bun?: BunOptions;
  /** Used by both the `deno` and `deno-deploy` targets. */
  deno?: DenoOptions;
  /** Used by the `netlify-edge` target. */
  netlify?: NetlifyOptions;
  ignore?: IgnoreRule[];
  levels?: Partial<Record<Category, Level>>;
  /** Extra export conditions to resolve with, before the target's own. */
  conditions?: string[];
  /** Variables a bundler replaces with a constant. Code a constant removes is not checked. */
  env?: EnvOptions;
}
