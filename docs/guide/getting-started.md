# Getting started

This page takes you from nothing to a first report in a couple of minutes.

## Requirements

- Node.js 22.18 or newer. edgefit runs on Node even when the project you check targets Bun or Deno.
- Your project's dependencies installed, so `node_modules` exists. edgefit reads the packages you actually ship.

## Try it without installing

```sh
npx edgefit check
```

If your project has a `wrangler.jsonc`, `wrangler.json` or `wrangler.toml`, that is all you need. edgefit reads the entry point from wrangler's `main`, along with the compatibility date and flags.

For any other project, point it at the entry file:

```sh
npx edgefit check --entry src/index.ts
```

## Install it in the project

Installing edgefit as a dev dependency pins the version, which also pins the compatibility data, and gives your config file types.

::: code-group

```sh [npm]
npm install --save-dev edgefit
```

```sh [pnpm]
pnpm add --save-dev edgefit
```

```sh [yarn]
yarn add --dev edgefit
```

```sh [bun]
bun add --dev edgefit
```

:::

Then add a script:

```json [package.json]
{
  "scripts": {
    "edgefit": "edgefit check"
  }
}
```

## Your first check

<Steps>

### Run the check

```sh
npx edgefit check --entry src/index.ts
```

### Read the header

```
edgefit · workerd (Cloudflare Workers)
  entry src/index.ts · 5 modules · conditions workerd, worker, browser
  data workers-nodejs-compat-matrix@ee58120 (workerd 1.20260929.1), ...
  settings compatibility_date 2026-09-29, flags: nodejs_compat (from wrangler.jsonc)
```

The header says which target was checked, how many modules were reached, which export conditions were used, which data the results come from, and where the runtime settings were read from.

### Read the findings

```
error    unsupported  node:fs.watch  (workerd)
       file watching is not implemented; throws ERR_UNSUPPORTED_OPERATION
       chokidar@4.0.1  node_modules/chokidar/index.js:5:13
       via src/index.ts > src/dev/reload.ts > chokidar

warning  unknown  require(<expression>)  (workerd)
       cannot be checked statically: the module name is computed at runtime
       pg-lite@0.3.0  node_modules/pg-lite/lib/index.js:12:10
       via src/index.ts > pg-lite

1 error, 1 warning
```

Each finding starts with its level and [category](/guide/findings). The `via` line is the import chain: follow it to see why a package is in your graph at all.

### Fix or accept

Remove the import that pulls the package in, swap it for one that supports the runtime, or, if the code path never runs in production, [ignore it](/guide/configuration#ignoring-findings) with a reason.

</Steps>

## Check more than one runtime

Pass `--target` more than once. An `--entry` is used for every target. Without one, a target without its own entry uses the first target's entries.

```sh
npx edgefit check --target workerd --target bun --target deno
```

To see the results side by side, use [`edgefit compare`](/guide/compare).

## Exit codes

| Code | Meaning                                                |
| ---- | ------------------------------------------------------ |
| `0`  | No error-level findings                                |
| `1`  | At least one error-level finding                       |
| `2`  | Invalid input, or a project that could not be resolved |

Warnings never fail the run. You can raise or lower any category with [`levels`](/guide/configuration#levels).

## Next

- [Reading findings](/guide/findings) explains every category.
- [Configuration](/guide/configuration) covers `edgefit.config.ts`.
- [Pull request checks](/guide/ci) runs edgefit on every pull request.
