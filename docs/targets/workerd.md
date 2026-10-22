---
description: 'Cloudflare Workers Node.js compatibility with edgefit: your wrangler compatibility date and nodejs_compat flag, checked against workerd data.'
---

# Cloudflare Workers Node.js compatibility

Target name: `workerd`. This is the default target.

```sh
npx edgefit check --target workerd
```

## Wrangler integration

If the project root has a `wrangler.jsonc`, `wrangler.json` or `wrangler.toml`, edgefit reads:

- `main` as the entry point, when no `--entry` or config `entry` is given. It is read relative to the config it is written in
- `compatibility_date`
- `compatibility_flags`

A build can leave a deploy config for wrangler to use instead: `.wrangler/deploy/config.json` points to it. Nitro 3 does this and writes no config in the project root. edgefit follows the redirect first, like wrangler, so a Nitro build needs no `--entry` and its compatibility date and flags are read from `.output/server/wrangler.json`.

The report header shows where the settings came from:

```
settings compatibility_date 2026-09-29, flags: nodejs_compat (from wrangler.jsonc)
```

Without a wrangler config, edgefit uses the settings the compatibility data was generated with (its date and `nodejs_compat`), and says so in a note in the report and in the JSON `notes`. A wrangler config that has no `compatibility_flags` enables none, as on Workers. One with no `compatibility_date` gets the data's date, with a note. You can override any of this in the [config file](/guide/configuration#cloudflare-workers).

## Cloudflare Pages

A Pages config has `pages_build_output_dir` and no `main`. With no `--entry` or config `entry`, edgefit looks for the server code that Pages runs, in this order:

1. `<pages_build_output_dir>/_worker.js`, a file, or a folder with an `index.js`. This is build output, so edgefit checks it as `--built` does. Nitro and Nuxt write it with the `cloudflare_pages` preset. The SvelteKit and Astro Cloudflare adapters write it too.
2. Every `.js`, `.mjs`, `.ts`, `.tsx` and `.jsx` file in the `functions/` folder. Pages ignores `functions/` when `_worker.js` exists, so edgefit does too.

For a Pages project, edgefit does not guess other files, such as `src/index.ts`, and does not use the entries of other targets. The folder that `pages_build_output_dir` names is the Pages output folder. A worker is a `_worker.js` file, or a `_worker.js/index.js` file. When edgefit finds no server code, there are four outcomes:

- **Static files only.** The Pages output folder holds at least one file that is not a dotfile or `nitro.json`, and has no `_worker.js`. The project has no `functions/` folder. The Pages output folder has no Nitro marker (`nitro.json`), or the marker names a static preset. Nitro marks these presets as static: `static`, `cloudflare-pages-static`, `github-pages`, `gitlab-pages`, `netlify-static`, `vercel-static`, `zeabur-static` and `zerops-static`. A name with `_` in place of `-` is the same preset. A file that is not JSON, or that names no preset, is not a marker. Pages serves the folder as static files, so there is no server code to check. The workerd target gives a clean result and one note: `Pages serves dist as static files, so there is no server code to check on workerd.` The note names your Pages output folder in place of `dist`. The text report and the `notes` of the workerd target in the JSON report show the note. The report shows `no server code` and no module, and the JSON `entries` list is empty. The other targets run as before.
- **A Nitro build without a worker.** The marker in the Pages output folder names a preset that is not static, and the folder has no worker. Any preset that is not in the list above counts as a server preset. The check fails with `No entry point to scan.` The advice names the marker, its preset and its build date. It also names `.output/nitro.json` when that file has another preset and a later build date, because the last build wrote its files there. For a `cloudflare-pages` marker, the advice says that a static build writes no worker, and names `NITRO_PRESET=cloudflare-pages-static` for static files only. For any other preset, the advice asks for a build with `NITRO_PRESET=cloudflare_pages`. When the Pages output folder has no marker, edgefit reads `.output/nitro.json` instead.
- **No output yet.** The Pages output folder does not exist, or holds no file other than dotfiles and `nitro.json`. The check fails with `No entry point to scan.` The advice tells you to build the project, or to check `pages_build_output_dir`. It names the framework when `package.json` lists one. See [framework build output](/guide/built-output).
- **Anything else.** The `_worker.js` folder has no `index.js` file, or the `functions/` folder has no file that Pages runs. The check fails with `No entry point to scan.` The advice says what each of them needs.

## Compatibility date and flags

Workers turns on native Node modules one by one, gated by compatibility flags that become defaults at a given date when `nodejs_compat` is on. For example, `fs` is native from `2025-09-15` with `enable_nodejs_fs_module`, and `child_process` from `2026-03-17`.

A module that is not native at your date and flags is reported as `mocked`, because wrangler bundles an unenv polyfill in its place. A constant value that the polyfill provides, such as `EOL` from `node:os`, is not reported. Moving your compatibility date forward often clears a group of findings at once.

## What the data covers

- **Node API data** from workers-nodejs-compat-matrix, generated with workerd `1.20260929.1`.
- **Curated overrides** for APIs that the matrix reports as present but that throw or do nothing when called. Some examples:

| API                    | Result        | Why                                                                 |
| ---------------------- | ------------- | ------------------------------------------------------------------- |
| `node:fs.watch`        | `unsupported` | throws `ERR_UNSUPPORTED_OPERATION`                                  |
| `node:child_process.*` | `unsupported` | throws `ERR_METHOD_NOT_IMPLEMENTED`; Workers cannot spawn processes |
| `node:dgram`           | `mocked`      | sockets accept calls but never send or receive                      |
| `node:readline`        | `mocked`      | functions are no-ops; interfaces never emit input                   |
| `node:tls.connect`     | `mismatch`    | throws for some options, such as `ALPNProtocols`                    |

An entry with the status `mismatch` can name the options that make a call fail. Then only a call that passes one of them is a finding, and an option that fails only from a compatibility date follows your date and flags.

The overrides also say that the globals `window`, `document`, `HTMLAnchorElement`, `Deno` and `Bun` are missing, so code behind a check such as `typeof window !== 'undefined'` is guarded. A call, a construction or a member of one of these globals through the global object, such as `globalThis.document.title`, is a finding when no check protects it.

The matrix does not list `node:cluster`, `domain`, `inspector`, `punycode`, `repl`, `tty`, `v8`, `vm`, `wasi` and `worker_threads`. The overrides record that each of them loads with `nodejs_compat` at compatibility date 2026-09-29, so an import of one gives no finding at a date from which the module is native (see the gates above). Their members are not measured, so a use of a member is an `unknown` warning, unless an `apis` entry covers it.

The full list is in `data/overrides/workerd.json` in the package. Each entry links to the workerd source file it was read from.

## Export conditions

Packages are resolved with `workerd`, `worker` and `browser`, then `import`, `require` and `default`. A package with a Workers-specific build is checked on that build.
