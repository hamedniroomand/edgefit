# Netlify Edge Functions

Target name: `netlify-edge`.

```sh
npx edgefit check --target netlify-edge
```

Netlify Edge Functions run in a [Deno](https://docs.netlify.com/build/edge-functions/api#runtime-environment) runtime, so this target answers with the Deno data and adds what is Netlify's own: where the entry and import map come from, and its Web API column.

## What the data covers

- **Node API data** is the compatibility matrix's Deno dump, the same one the [`deno` target](/targets/deno) uses.
- **Web API data** comes from the `netlify` column of runtime-compat-data instead of its `deno` column. The two differ on a few features, such as `Storage`.
- **Curated overrides:** none yet. Netlify's documentation says edge functions support Node.js built-in modules and lists no blocked ones. Its [limits page](https://docs.netlify.com/build/edge-functions/limits) covers bundle size, memory and CPU time, which edgefit does not check.

## The Deno version

Netlify does not document which Deno it runs. The data records the oldest one `@netlify/edge-bundler` accepts (`^2.4.2` in bundler 16.1.1), so the report says Deno `2.4.2` or newer, and notes that it is older than the data. APIs added to Deno since then are reported as supported.

If Netlify runs a newer Deno than that, results are unaffected. If it runs 2.4.2, some APIs the data marks as present are missing there. The weekly probe lists them in the job summary (the `netlify-min` run), but they are not applied to your report, because that would report errors that may not exist.

## Entry detection

edgefit reads `netlify.toml` from the project root.

- `[[edge_functions]]` names the functions. With exactly one, its file is the entry.
- `[build] edge_functions = "dir"` moves the directory from the default `netlify/edge-functions`.
- Without declarations, a directory with exactly one source file gives that file.

With several functions, or none, edgefit says so in a note and you pass `--entry`. Functions declared inline with `export const config` are found as files in the directory, not by their config.

To use a different file, set `netlify: { configFile: 'path/to/netlify.toml' }` in the edgefit config, or `false` to skip it.

## Import maps

Netlify reads its import map from a separate file that `netlify.toml` names, and does not read import maps in `deno.json`:

```toml
[functions]
  deno_import_map = "./import_map.json"
```

edgefit applies that file to your own code, so this target ignores `deno.json` and the `deno` config option.

## Export conditions

Packages are resolved with the `node` condition, then `import` and `default`, and not with `deno`. `@netlify/edge-bundler` bundles npm dependencies with esbuild for the node platform and passes no conditions (`dist/node/npm_dependencies.js` in 16.1.1), so a package's `deno` build is not what Netlify uses.

The bundler defines `process.env.NODE_ENV` as `production`, and so does edgefit. Two other things it does are not applied: it reads the `module`, `browser` and then `main` fields, and it injects `process`, `Buffer` and `setImmediate` for npm dependencies.

## Runtime checks

Netlify Edge Functions are both Deno and Netlify, so code behind `typeof Deno !== 'undefined'` or `typeof Netlify !== 'undefined'` is checked here, and code behind `typeof Bun` or a check that Netlify is absent is not.

## What is not checked

- **The `Netlify` global and its APIs**, such as `Netlify.env`, like other runtime-specific APIs.
- **Limits:** 20 MB of code after compression, 512 MB of memory, 50 ms of CPU time per request.

`edgefit compare` leaves `netlify-edge` out unless you name it, because its Node results match `deno`.

## Keeping it current

A weekly job compares the Deno range of the newest `@netlify/edge-bundler` and a hash of the documentation sections above with what the data records, and adds a section to the data drift issue when they differ. See [Keeping the data current](/contributing/maintenance).
