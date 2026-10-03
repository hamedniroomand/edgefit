# Checking packages

`edgefit package` checks a published package, not a project. It is the tool behind the [package compatibility table](/packages/) and the badge you can put in a README.

```sh
npx edgefit package hono
npx edgefit package @scope/name@^2 --target workerd
npx edgefit package .            # your own package, as `npm publish` would ship it
```

## How it works

1. The package is installed into a temporary project with `npm install --ignore-scripts`. Its code is never run, only read, and the project is deleted afterwards.
2. Each public entry point, one for every subpath in `exports` (or `main` without one), gets an entry file that imports it as a namespace. Every export counts as used, which is the worst case for "I import this entry point". A finding that only some exports reach is listed under those exports and does not change the status of the entry.
3. The usual [check](/guide/findings) runs on each entry for each target.

A subpath passes when there are no findings, warns when there are only warnings, and fails when there is an error. The result of a target is the result of its main entry. Warnings are never shown as passes.

The result of a target is the result of the main entry (`.`), because that is what an import of the package gets. When a subpath is worse, `edgefit package` names it on a `worst subpath` line, and the [package table](/packages/) shows it as a second, smaller mark, and names it in the tooltip of the cell. The row detail lists the subpaths that are not a pass, with their finding counts. A finding that only some exports of an entry reach, such as `createServer` of `mysql2`, which needs a port that a Worker cannot open, is listed under those exports in the detail, and `edgefit package` names the worst export on a `worst export` line when it is worse than the result of the target. The table shows the worst export as another small mark when it is worse than the result of the target, and names it in the tooltip. The module body and what every export reaches still set the status. `edgefit check` gives the same finding to a project that imports the export, and none to a project that does not. The status filter and the sort of the table use the result of the main entry. A package without a main entry, or whose main entry could not be checked, takes the worst subpath.

A package that has no `.` entry, such as `firebase`, can name the subpath that stands for it: `edgefit package firebase --main ./app`. The result of a target then comes from that subpath, `edgefit package` prints `main entry: ./app`, and the worst subpath is still named when it is worse. A row of the table does the same with a `main` field in `table/packages.json`. The subpath has to be one that is checked, so it cannot be one that `--skip` or `--export` leaves out.

## What a pass means

A static check found no API that the target lacks or stubs, in the code that a public entry point of the package runs when it loads, or that every export of it reaches. A finding that only some exports reach is listed under them. It was checked against [pinned data](/guide/status), for the resolved version on the check date.

In the table, the main entry mark is the result of the main entry only. The second mark is the worst subpath, when it is worse than the main entry. A third mark is the worst export, when it is worse than the result of the target.

## What a pass does not mean

- The package was not run.
- Dynamic requires and imports, and `jsr:` imports, are reported as `unknown`, which is a warning.
- Native addons show up only as findings.
- Platform limits such as bundle size and CPU time are not checked.
- A different version may differ.
- What your own app imports may be narrower, and therefore better. Run `edgefit check` on your app.

The [limitations](/guide/limitations) apply to packages as they do to projects.

## Badges

`edgefit package <name> --badge badge.svg` writes a static SVG such as `edgefit | workerd ✓ bun ✓ deno ⚠`: green for a pass, amber for warnings only, red for a failure, grey when the check could not run. Commit it, or regenerate it in CI.

A badge shows the result of the main entry, the same as the row of the table. The row detail lists a subpath that is worse. The Markdown snippet in the table uses this badge.

Packages in the table have badges at `https://edgefit.kitdev.space/packages/badges/<name>.svg`, with `@scope/name` written as `scope__name`, and `<name>.<target>.svg` for one target. Each row of the table shows the Markdown to copy. The badge should link to the package's row, so the caveats are one click away:

```md
[![edgefit](https://edgefit.kitdev.space/packages/badges/hono.svg)](https://edgefit.kitdev.space/packages/#hono)
```

For shields.io styling, use `https://img.shields.io/endpoint?url=https://edgefit.kitdev.space/packages/badges/<name>.json`.

## Popular libraries

A snapshot from `edgefit package` on 2026-10-01 (the data pinned in 0.5.0), for each package's main entry point. `workerd` assumes the `nodejs_compat` flag. The live results are in the [package table](/packages/).

| Package                                                  | workerd | Bun | Deno | Why                                                                                                  |
| -------------------------------------------------------- | ------- | --- | ---- | ---------------------------------------------------------------------------------------------------- |
| `hono`, `zod`, `drizzle-orm`, `jose`, `stripe`, `lodash` | ✓       | ✓   | ✓    |                                                                                                      |
| `pg`, `postgres`, `bcryptjs`                             | ✓       | ✓   | ✓    |                                                                                                      |
| `axios`, `ws`                                            | ✓       | ✓   | ⚠    | An access to `node:http` or `node:events` that edgefit cannot check                                  |
| `openai`                                                 | ⚠       | ⚠   | ⚠    | A `globalThis[...]` access that edgefit cannot check                                                 |
| `express`                                                | ✗       | ⚠   | ⚠    | `process.binding`, which Workers do not implement, reached through `body-parser`. Use `hono` instead |
| `chokidar`                                               | ✗       | ✓   | ✓    | Watches files, which Workers cannot do. Keep it out of the Worker                                    |
| `sharp`                                                  | ✗       | ⚠   | ⚠    | A native addon that starts processes (`detect-libc`). Use an image service instead                   |

A ✓ is only as good as [what a pass means](#what-a-pass-means). The `⚠` rows are not failures: edgefit reports what it cannot analyze as `unknown`.

## Adding a package to the table

Open an issue with the package request form, or a pull request that adds one line to `table/packages.json`. CI runs `edgefit package` on the added package, so the pull request shows its result.

## Optional peer dependencies

`edgefit package` does not install peer dependencies. An optional peer that is not installed gives no finding. The entry lists it as a note, `peer react not installed, checked in your project`, in the output of `edgefit package`, in the `notes` of the entry in the JSON result, and in the row detail of the table. The status of the entry comes from the other findings. `edgefit check` on a project does not change: a missing optional peer there is still an `unknown` warning, because the code of the project can reach it.

## Modules that the user names

Some packages load a module that their user chooses, such as `require(mod)` for a view engine that the user configures. The name comes from a parameter of the function around the call, a property of one, or a value set from one, and the file does not call that function by its name. The module is not part of the package, so its support is not a finding of the package. The entry lists it as a note, `loads a module the user names (view.js:81)`, in the same places as an optional peer. The status of the entry comes from the other findings. `edgefit check` gives the same note, with the name of the package in front, in the `note:` lines under the target header and in `suppliedLoads` of the JSON output. The two outputs agree. A name built with a prefix, such as `require('./locales/' + name)`, is not a module that the user names, and stays `unknown`. So does a function that its own file calls with a name of its choice. In build output, such as a Next.js or Nuxt build, the rule does not run and the call stays `unknown`, because the output holds the callers of its own functions.
