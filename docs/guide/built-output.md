# Framework build output

Frameworks such as Nuxt, Nitro, SvelteKit and Astro import virtual modules like `#imports` that only the framework's own build can resolve. edgefit cannot follow those from your source, so for framework apps you build first and scan the output.

```sh
npx nuxi build --preset cloudflare_module
npx edgefit check --built .output/server
```

`--built` takes the output directory or its entry file:

```sh
npx edgefit check --built .output/server            # the directory
npx edgefit check --built .output/server/index.mjs  # or the entry file
```

`--built` and `--entry` cannot be used together.

You don't need `--built` when the entry is already inside a Nitro output, for example when wrangler's `main` is `.output/server/index.mjs`. edgefit sees the `nitro.json` next to it and scans the output as build output.

## How the entry is found

For a directory, edgefit uses the `main` of a wrangler config inside it. Otherwise it looks for the first of these files:

- `index.mjs`
- `index.js`
- `_worker.js`
- `_worker.js/index.js`
- `worker.js`

From there it follows static and dynamic imports between the output chunks.

## Turn on sourcemaps

Without sourcemaps, findings point into the build chunks, which is rarely where you want to fix anything. With them, each finding is mapped back to the original file and package, and the chunks it was reached through become its chain:

```
error    unsupported  navigator.locks.request  (workerd)
       does not exist on the target
       task-lock@2.1.0  node_modules/task-lock/index.js:2:26
       via .output/server/index.mjs > .output/server/chunks/nitro/nitro.mjs > .output/server/chunks/routes/index.mjs > task-lock
```

edgefit picks up a `sourceMappingURL` comment (inline or pointing to a file), or a `.map` file next to the chunk.

::: tip Nitro and Nuxt
Build with `sourcemap: true`. Nitro also empties the mappings of server sourcemaps unless you set `experimental.sourcemapMinify: false`.
:::

When the maps have no mappings, the report adds a note saying so.

### Without sourcemaps

Recent Nitro builds mark the code of every module in a chunk with `//#region <path>` comments. When a chunk has no sourcemap, edgefit reads those markers to name the package a finding belongs to, so the report says `jose@6.2.12` instead of `your code`, and an [ignore rule](/guide/configuration#ignoring-findings) with `package` works.

The file and line still point into the chunk, because the markers name the original file but not the line inside it. Chunks without markers, such as those from older Nitro versions, stay unattributed.

```
error    unsupported  navigator.locks.request  (workerd)
       does not exist on the target
       jose@6.2.12  .output/server/_libs/jose.mjs:1875:34
       via .output/server/index.mjs > .output/server/_libs/jose.mjs > jose
```

## Polyfills the build injected

Framework presets for edge runtimes replace Node modules with [unenv](https://github.com/unjs/unenv) polyfills. After the build, there is no `node:fs` import left to find, only the polyfill. With sourcemaps, edgefit recognizes code bundled from unenv's `runtime/node` and `runtime/mock` folders and reports it as `mocked`, located in the unenv file:

```
error    mocked  node:fs  (workerd)
       is replaced by an unenv polyfill in the build, where missing members throw or do nothing
       unenv@2.0.0-rc.24  node_modules/unenv/dist/runtime/node/internal/fs/fs.mjs:1:1
       via .output/server/index.mjs > .output/server/chunks/nitro/nitro.mjs > .output/server/chunks/routes/index.mjs > unenv
```

This is the only way to see these, which is one more reason to keep sourcemaps on. Nitro keeps the `sources` this needs by default.

If a polyfill is known to be fine for how you use it, lower the level or ignore it:

```ts
export default defineConfig({
  ignore: [{ package: 'unenv', api: 'node:process', reason: 'only process.env is used' }],
});
```
