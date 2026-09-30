# Changelog

## Unreleased

### Changed

- The GitHub Action's warning about a base commit it could not check now says to build in `install-command` when the entry is build output, and the action docs explain why the base needs its own build.

## 0.4.0

The GitHub Action installs the published package, and the text report is easier to read with pnpm.

### Changed

- The GitHub Action installs the published `edgefit` package instead of building itself, so it no longer needs pnpm or corepack. It runs the version its tag was released with, verifies the signature and provenance with `npm audit signatures`, and has new inputs `edgefit-version` and `edgefit-package`. `edgefit-version: source` keeps the old build for one release.
- The text report shows a package installed by pnpm as `node_modules/<package>/...` instead of its path in the `.pnpm` store. The JSON report and GitHub annotations keep the real file path.

## 0.3.2

The GitHub Action works outside pull requests.

### Fixed

- The GitHub Action no longer fails on events other than `pull_request`. On a `push` it compares with the commit before the push, and on a manual or scheduled run, or a push that creates a branch, every finding counts as new. Only pull requests get a comment; every event gets annotations and a job summary.

## 0.3.1

A fix for false errors on projects without `nodejs_compat`, and documentation.

### Fixed

- `const { process } = globalThis` is no longer reported as a use of `process`. Only the places the name is used count, and a use after a check such as `process !== void 0` is guarded. This removes the `node:process needs the nodejs_compat flag` error that Hono's `color.js` produced in a project without `nodejs_compat`.
- `void 0` counts as `undefined` in checks like `x !== void 0`, which is how minified code writes them.
- An API a missing `nodejs_compat` flag leaves undefined (`process`, `Buffer`, `global`, and Node modules) counts as absent, so code that checks for it first is reported as guarded instead of failing the check. An import of a Node module without the flag still fails.

### Documentation

- A [status page](https://edgefit.kitdev.space/guide/status) lists the runtime versions in the data and how current they are. The [limitations](https://edgefit.kitdev.space/guide/limitations) page now covers the age of the data, assumed settings, which build outputs are tested and more.
- The GitHub Action examples use `@v0`. It follows the newest 0.x release, and the page says how to pin an exact release or a commit SHA.

## 0.3.0

The data now describes the newest workerd, Bun and Deno, and the project keeps itself honest about it.

### Added

- `edgefit --version` and `-v` print the installed version.

### Data

- The compatibility data now describes workerd 1.20260929.1, Bun 1.4.2 and Deno 2.9.7 (it was workerd 1.20260424.1, Bun 1.3.13 and Deno 2.7.13). The workerd compatibility date is 2026-09-29. The provider's repository has no newer dumps, so the three were regenerated with its own scripts; the Node baseline is unchanged.
- Bun now implements most of `node:inspector`, `node:v8`'s heap and GC functions, `vm.measureMemory`, `worker_threads.markAsUntransferable` and `node:test`'s `mock`, so those are no longer reported as unsupported. Deno now implements the `node:test` hooks, `mock.timers`, `v8.GCProfiler`, `v8.promiseHooks`, `v8.queryObjects`, `v8.startupSnapshot`, `v8.setFlagsFromString` and several `worker_threads` functions, and has `navigator.locks`.
- workerd: `net.Server` can listen on a port the platform declares, so it is a mismatch rather than unsupported. `inspector.open`, `close`, `url` and `waitForDebugger` do nothing instead of throwing, so they are reported as mocked. `vm`, `v8` and `dns` functions that were reported as throwing still do.

### Project

- A weekly check compares the pinned data with the newest runtime releases and keeps one issue up to date with what changed. A separate workflow regenerates the runtime dumps on Linux for a data bump, and the contributing docs have a runbook for both.

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
