# Deno and Deno Deploy

Target names: `deno` and `deno-deploy`.

```sh
npx edgefit check --target deno --entry main.ts
```

## What the data covers

- **Node API data** is the compatibility matrix's Deno `2.9.7` dump, compared with the same Node baseline.
- **Curated overrides** are read from Deno's `ext/node` polyfills at the same version. They cover stubs that call `notImplemented`, such as `v8.takeCoverage` and `cluster.fork`, and exports Deno lacks in modules the matrix does not cover, such as `child_process` and `worker_threads`.

## Import maps and specifiers

edgefit reads `deno.json`, then `deno.jsonc`, from the project root.

- The import map, either `imports` or the file `importMap` points to, is applied to your own code.
- `npm:pkg@1/sub` resolves as `pkg/sub` from `node_modules`. Run `deno install` with `nodeModulesDir` set first, so the packages are on disk.
- In a Deno workspace, a member inherits the `imports` of the workspace root. The member's own entries win. Run edgefit from the member directory, or set `--root` to it.
- A `jsr:@scope/name` import that names a workspace member is followed through the `exports` of that member. The version range is not checked. A file of a member uses the import map of that member, below the map of the workspace root. Other `jsr:` packages are not read. They are reported as `unknown`, with the package name.

To use a different config file, set `deno: { configFile: 'path/to/deno.jsonc' }` in the edgefit config, or `false` to skip it.

## Export conditions

Packages are resolved with `deno` and `node`, then `import` and `default`. `browser` fields are not applied.

## Deno Deploy

`deno-deploy` uses the Deno data and adds its own override layer on top.

Deno Deploy runs the standard Deno runtime with all permissions, so the layer blocks nothing today. The restrictions of Deno Deploy Classic, such as no subprocesses and a read-only file system, ended when Classic shut down on July 20, 2026.

Deploy runs Deno `2.5.0`, which is older than the data, so the report notes that APIs added since then are reported as supported.

Because its results currently match `deno`, `edgefit compare` leaves `deno-deploy` out unless you name it.
