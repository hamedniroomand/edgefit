---
description: 'Run edgefit check after vite build with the Cloudflare Vite plugin or Nitro: what each command reports, and how to get the package and the import chain.'
---

# Check after `vite build`

The Cloudflare Vite plugin and Nitro 3 write `.wrangler/deploy/config.json` when they build. edgefit reads that file, so a check after the build needs no flag:

```sh
npx vite build
npx edgefit check
```

Add it to the build script to run it each time:

```json [package.json]
{
  "scripts": {
    "build": "vite build && edgefit check"
  }
}
```

`edgefit check` exits with `1` when it finds an error, so the script stops there.

## What each command reports

The check with no flag reads the build output. A bundler joins the code of all packages in the output, so this check gives the least detail. Use the command that fits the project:

| Project                                                          | Command                              | What a finding names                                                |
| ---------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| A Worker whose entry is a file of yours, such as `src/index.ts`  | `edgefit check --entry src/index.ts` | The package, the file in the package and the import chain           |
| A framework that imports virtual modules, such as Nitro          | `edgefit check`                      | The output file. With sourcemaps, also your own files and polyfills |
| Output of the Cloudflare Vite plugin, when `--entry` cannot work | `edgefit check --built dist/<name>`  | The output file. With sourcemaps, also your own files               |

`<name>` is the name of the Worker, with `_` in place of `-`.

### A Worker with an entry file

After a build, `edgefit check` with no flag reads `dist/<name>/index.js`:

```
error    unsupported  node:fs.watch  (workerd)
       file watching is not implemented; throws ERR_UNSUPPORTED_OPERATION
       your code  dist/my_worker/index.js:1:28
```

The finding is correct, but it does not name the package. The label `your code` is not correct here: the line is in the output, and it can come from a package.

With `--entry`, edgefit follows the source and names the package and the chain:

```
error    unsupported  node:fs.watch  (workerd)
       file watching is not implemented; throws ERR_UNSUPPORTED_OPERATION
       chokidar@6.0.0  node_modules/chokidar/backend.js:1:10
       via src/index.ts > chokidar
```

The settings still come from the config that the build wrote. Before the first build, `edgefit check` reads the wrangler config in the root and gives the same result with no flag.

### A framework build

edgefit cannot follow the virtual modules of a framework from the source, so it checks the output. Turn on sourcemaps to get more than the output file. For Vite:

```ts [vite.config.ts]
export default defineConfig({
  build: { sourcemap: true },
});
```

Nitro also needs `sourcemap: true` and `experimental.sourcemapMinify: false` in its own options. See [Framework build output](/guide/built-output#turn-on-sourcemaps).

With sourcemaps, a finding in your own code names your file, and a Node.js module that the build replaced with an unenv polyfill is reported as `mocked`. A finding in the code of a package can still point to the output file, with the owner `build output`. Rolldown moves the imports of a Node.js module to the top of the output file, and that line has no place in a package.

## Limits

- The check reads what the last build wrote. Build again after a change, or the report describes old code.
- A project with more than one Worker has one output for each. The check with no flag reads the one that `.wrangler/deploy/config.json` names. Pass `--built` for each other output.
- A clean run is not a guarantee. See [Limitations](/guide/limitations).
