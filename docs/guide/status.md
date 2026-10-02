# Status

What edgefit checks today, against which runtime versions, and how much you can lean on it. This page is kept in step with the data: a test fails when the versions below stop matching `data/source.json`.

## Runtime versions in the data

Every result comes from data that is pinned to these releases. `edgefit targets` prints the same thing for the version you have installed.

| Target         | Runtime in the data | Notes                                                                                                                                                    |
| -------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workerd`      | 1.20260929.1        | Compatibility date 2026-09-29, `nodejs_compat`                                                                                                           |
| `bun`          | 1.4.2               |                                                                                                                                                          |
| `deno`         | 2.9.7               |                                                                                                                                                          |
| `deno-deploy`  | Deno 2.5.0 layer    | Deno Deploy runs an older Deno, so it has its own curated overrides                                                                                      |
| `netlify-edge` | Deno 2.3.1          | Measured on Netlify by the production witness, with a layer for blocked subprocesses and file writes outside `/tmp`                                      |
| `vercel-edge`  | Docs of 2026-08-03  | Experimental: Vercel's documented allowlist, not a runtime dump. Members from `next` 16.3.8 and `@vercel/node` 17.0.0. Emulator `@edge-runtime/vm` 5.0.0 |

| Data                      | Version                                                                |
| ------------------------- | ---------------------------------------------------------------------- |
| Node API baseline         | Node 20.20.2, 22.22.2 and 24.15.0, merged                              |
| Node compatibility matrix | workers-nodejs-compat-matrix at `ee58120`, runtime dumps of 2026-09-29 |
| Curated overrides         | Read from each runtime's source at the versions above                  |
| Web API data              | runtime-compat-data 0.0.5, published March 2024                        |

The runtime dumps were made on Linux without a terminal, the way the matrix provider makes them.

## How current the data is

The data is pinned, so it only changes with an edgefit release. A workflow compares it with the newest release of each runtime every week and keeps one GitHub issue, labelled [`data`](https://github.com/hamedniroomand/edgefit/issues?q=label%3Adata), up to date with what changed. It closes the issue when the data has caught up. So the data can be at most a week behind the runtimes in what edgefit knows about, and a release follows a data update.

Two parts are older than the rest, and the [limitations](/guide/limitations#the-data-has-an-age) say so: the Web API data (2024) and the third-party matrix that the runtime dumps are generated with.

## What is covered

- Node built-in modules and their members, and Web API globals, for Cloudflare Workers, Bun, Deno, Deno Deploy, Netlify Edge Functions and (experimental) Vercel Edge.
- Your code and every dependency, resolved the way the target's bundler does, with the import chain behind each finding.
- Suggested fixes for findings, from a reviewed list of packages and APIs and from the settings of the target.
- Published packages, with `edgefit package` and the [package table](/packages/).
- Framework build output from Nitro and Nuxt, mapped to packages with sourcemaps or, without them, with the build's region markers.
- Pull request checks with the GitHub Action, JSON reports, and `diff` between two reports.

What it does not do is listed on the [limitations](/guide/limitations) page.

## Stability

edgefit is a 0.x release. What you can rely on:

- The **JSON report** carries a `version` field (currently `1`) that changes on any breaking change to its shape.
- **Exit codes** are documented and stable: `0` no errors, `1` findings at error level, `2` invalid input or project.
- The **text report** and the JavaScript API can still change between minor releases. The [changelog](https://github.com/hamedniroomand/edgefit/blob/main/CHANGELOG.md) lists every change.

## How precision is kept

False errors cost more trust than missed warnings, so precision is tested, not assumed:

- **Sample apps.** Small apps built on real, pinned packages: a Hono starter, Hono with zod, drizzle-orm on D1, a Postgres client (`pg`), a Nitro build with pieces of oauth4webapi and jose, and Hono as a Netlify Edge Function and as Vercel Routing Middleware. Each must report no errors and no warnings that nobody can act on, and where a result depends on `nodejs_compat` both cases are checked. A known-bad app (a file watcher and a process spawner) must report exactly what each runtime lacks, including every module Vercel Edge does not allow, so a change that makes edgefit miss an API fails too. A failure there is a regression.
- **Fixture projects** cover the findings, the guards, the constant specifiers, the build output layouts and the settings.
- **The weekly probe** runs the real runtimes and compares them with the curated overrides, which is how stale entries are found.

## Where it is going

Planned work is tracked as [issues](https://github.com/hamedniroomand/edgefit/issues), grouped by milestone. Bugs and wrong results are welcome as issues, especially a wrong result with the API and target: see the [FAQ](/guide/faq#a-finding-is-wrong-what-do-i-do).
