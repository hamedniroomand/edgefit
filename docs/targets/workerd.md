# Cloudflare Workers

Target name: `workerd`. This is the default target.

```sh
npx edgefit check --target workerd
```

## Wrangler integration

If the project root has a `wrangler.jsonc`, `wrangler.json` or `wrangler.toml`, edgefit reads:

- `main` as the entry point, when no `--entry` or config `entry` is given
- `compatibility_date`
- `compatibility_flags`

The report header shows where the settings came from:

```
settings compatibility_date 2026-04-24, flags: nodejs_compat (from wrangler.jsonc)
```

Without a wrangler config, edgefit uses the settings the compatibility data was generated with. You can override any of this in the [config file](/guide/configuration#cloudflare-workers).

## Compatibility date and flags

Workers turns on native Node modules one by one, gated by compatibility flags that become defaults at a given date when `nodejs_compat` is on. For example, `fs` is native from `2025-09-15` with `enable_nodejs_fs_module`, and `child_process` from `2026-03-17`.

A module that is not native at your date and flags is reported as `mocked`, because wrangler bundles an unenv polyfill in its place. Moving your compatibility date forward often clears a group of findings at once.

## What the data covers

- **Node API data** from workers-nodejs-compat-matrix, generated with workerd `1.20260424.1`.
- **Curated overrides** for APIs that the matrix reports as present but that throw or do nothing when called. Some examples:

| API                    | Result        | Why                                                                 |
| ---------------------- | ------------- | ------------------------------------------------------------------- |
| `node:fs.watch`        | `unsupported` | throws `ERR_UNSUPPORTED_OPERATION`                                  |
| `node:child_process.*` | `unsupported` | throws `ERR_METHOD_NOT_IMPLEMENTED`; Workers cannot spawn processes |
| `node:dgram`           | `mocked`      | sockets accept calls but never send or receive                      |
| `node:readline`        | `mocked`      | functions are no-ops; interfaces never emit input                   |

The full list is in `data/overrides/workerd.json` in the package. Each entry links to the workerd source file it was read from.

## Export conditions

Packages are resolved with `workerd`, `worker` and `browser`, then `import`, `require` and `default`. A package with a Workers-specific build is checked on that build.
