# Checking packages

`edgefit package` checks a published package, not a project. It is the tool behind the [package compatibility table](/packages/) and the badge you can put in a README.

```sh
npx edgefit package hono
npx edgefit package @scope/name@^2 --target workerd
npx edgefit package .            # your own package, as `npm publish` would ship it
```

## How it works

1. The package is installed into a temporary project with `npm install --ignore-scripts`. Its code is never run, only read, and the project is deleted afterwards.
2. Each public entry point, one for every subpath in `exports` (or `main` without one), gets an entry file that imports it as a namespace. Every export counts as used, which is the worst case for "I import this entry point".
3. The usual [check](/guide/findings) runs on each entry for each target.

A subpath passes when there are no findings, warns when there are only warnings, and fails when there is an error. A target's overall result is its worst subpath. Warnings are never shown as passes.

The [package table](/packages/) also shows the result of the main entry (`.`). When it differs from the worst subpath, a row shows both: the main entry first, and the worst subpath as a smaller mark. The tooltip of the cell names the subpath that decides the worst result. The row detail lists the subpaths that are not a pass, with their finding counts. The status filter and the sort of the table use the worst result.

## What a pass means

A static check found no API that the target lacks or stubs, in code reachable from the package's public entry points with every export used. It was checked against [pinned data](/guide/status), for the resolved version on the check date.

In the table, the main entry mark is the result of the main entry only. The worst mark is the worst result of all subpaths.

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

A badge always shows the worst result, not the main entry result, so a badge never hides a subpath that warns or fails. The Markdown snippet in the table uses this badge.

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
