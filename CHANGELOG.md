# Changelog

## Unreleased

### Data

- The compatibility data now describes workerd 1.20260929.1, Bun 1.4.2 and Deno 2.9.7 (it was workerd 1.20260424.1, Bun 1.3.13 and Deno 2.7.13). The workerd compatibility date is 2026-09-29. The provider's repository has no newer dumps, so the three were regenerated with its own scripts; the Node baseline is unchanged.
- Bun now implements most of `node:inspector`, `node:v8`'s heap and GC functions, `vm.measureMemory`, `worker_threads.markAsUntransferable` and `node:test`'s `mock`, so those are no longer reported as unsupported. Deno now implements the `node:test` hooks, `mock.timers`, `v8.GCProfiler`, `v8.promiseHooks`, `v8.queryObjects`, `v8.startupSnapshot`, `v8.setFlagsFromString` and several `worker_threads` functions, and has `navigator.locks`.
- workerd: `net.Server` can listen on a port the platform declares, so it is a mismatch rather than unsupported. `inspector.open`, `close`, `url` and `waitForDebugger` do nothing instead of throwing, so they are reported as mocked. `vm`, `v8` and `dns` functions that were reported as throwing still do.

## Unreleased

- `edgefit --version` and `-v` print the installed version.

## 0.2.0

Fewer false errors and less noise on real projects.

### Fewer false findings

- Usages of an API the target lacks, in code that only runs when the API exists (`if (x.y)`, `typeof x.y`, `'y' in x`, `x.y?.()`, `x.y && x.y()` and guard clauses such as `if (!x.y) throw`), are reported as guarded. They do not fail a check: the text report counts them, `--verbose` lists them, and JSON has them under `guarded`. An API that exists and throws stays a finding, whatever checks come before it.
- A value that is only tested or compared with `undefined` is no longer counted as a use, and `typeof x[key]` is a check for a member, so its computed key is no longer reported as unknown.
- `import(name)` and `require(name)` are resolved when `name` is a `const` holding a plain string, so they are no longer reported as computed. This removes the `import(<expression>)` warning Hono's `color.js` produced.
- Symbol keys (`x[Symbol.iterator]`) and the global object on its own (`export { root }` after `const root = globalThis`) are no longer reported as unknown.

### Less noise

- `unknown` warnings are folded into one line per package in the text report, with a count for each API. `--verbose` lists them in full, and the JSON report and the summary are unchanged.

### Build output

- Build output without sourcemaps is attributed to packages through its `//#region` markers, so findings in a Nitro `_libs/` chunk name the package (for example `jose`) instead of `your code`, and `ignore` rules with `package` match. Locations still point into the build output.
- An entry inside a Nitro build output (a `nitro.json` beside it) is scanned as build output without `--built`.

### Wrangler settings

- The wrangler config that `.wrangler/deploy/config.json` points to is used when present, as wrangler does. A Nitro 3 build, which writes no config in the project root, now gets its entry, compatibility date and flags without `--entry`.
- `main` is read relative to the wrangler config it is written in, so it is right for a config outside the project root.
- The report says when the compatibility date or flags were assumed from the data because there is no wrangler config (or it has no `compatibility_date`), and how to set them.
- A wrangler config without `compatibility_flags` now enables no flags, as on Workers, instead of borrowing `nodejs_compat` from the data. Node built-ins are reported as unavailable for such a project, unless its date is 2026-08-04 or later. This can add findings for projects that relied on the old fallback.

## 0.1.0

- Initial release.
