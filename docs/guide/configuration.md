# Configuration

edgefit works without a config file. Add one when you want to set targets once, ignore findings you have accepted, or change how strict a category is.

## The config file

Create `edgefit.config.ts` in the project root. `.mts`, `.js` and `.mjs` work too.

```ts [edgefit.config.ts]
import { defineConfig } from 'edgefit';

export default defineConfig({
  targets: ['workerd', 'bun'],
  entry: 'src/index.ts',
  ignore: [{ package: 'chokidar', reason: 'dev server only' }],
  levels: { unknown: 'off' },
});
```

`defineConfig` does nothing at runtime. It only gives you types and editor completion. The config is bundled with esbuild before it is loaded, so TypeScript and relative imports work on any supported Node version.

To use a config somewhere else, pass `--config path/to/edgefit.config.ts`.

Command-line flags always win over the config file.

## Targets and entry

```ts
export default defineConfig({
  targets: ['workerd', 'deno'],
  entry: 'src/index.ts',
});
```

- `targets` defaults to `['workerd']`. The valid names are `workerd`, `bun`, `deno`, `deno-deploy`, `netlify-edge` and `vercel-edge`.
- `entry` is a path or a glob, or an array of them, relative to the project root. Globs skip `node_modules`. An `entry` in the config applies to every target.
- Without `entry`, each target finds its own: wrangler's `main` for workerd, every function for Netlify Edge, the middleware file for Vercel Edge. A workerd, Bun or Deno target that finds none uses the entries that the first such target found by a declaration, and the settings line says where they came from. Netlify Edge and Vercel Edge never use another target's entries. A target left without an entry is skipped, and the report says where it looked. The run fails only when no target has an entry. A project with a wrangler config can check Bun and Deno without repeating the entry.

## How entries are found

An `--entry` or a config `entry` always wins. Without one, each target looks in these places. A declaration beats a guess, and the settings line of the report names the source. A guess adds a note. The order is by certainty, not by specificity: a declared `package.json` `main` beats a guessed `scripts.start`, even for Bun.

| Target                   | Declared                                                                                                         | Guessed                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `workerd`                | wrangler `main`                                                                                                  |                                                                                  |
| `netlify-edge`           | `[[edge_functions]]` and functions that export `config` with a `path` or `pattern`, else the whole directory     |                                                                                  |
| `vercel-edge`            | `middleware.*`, and `api/**`, `pages/api/**` and `app/**/route.*` (also under `src/`) that set `runtime: 'edge'` |                                                                                  |
| `deno`, `deno-deploy`    | `deno.json` `exports`                                                                                            | the file in `tasks.start` or `tasks.dev`, then `main.ts`                         |
| `bun`                    | `package.json` `module`                                                                                          | the file in `scripts.start` or `scripts.dev`, then `index.ts`                    |
| `workerd`, `bun`, `deno` | `package.json` `exports` (the `.` entry), `module` or `main`                                                     | `src/index.*`, then `index.*`, then `package.json` fields in `dist/` or `build/` |

- A `scripts` or `tasks` command is read for `bun run file`, `bun file`, `deno run file` and `deno serve file`, after any `KEY=value`. Only the first command of a chain counts, and the file must exist.
- Only the project root is read. At a workspace root (`workspaces` in `package.json`, `pnpm-workspace.yaml`, or `workspace` in `deno.json`) nothing is guessed, so edgefit never picks an entry from another package. Run it in a package, or pass `--entry`.
- A `workerd`, Bun or Deno target with no entry of its own uses the declared entries of another such target. A guess is never lent. Netlify Edge and Vercel Edge never use another target's entries.
- A target with no entry is skipped, and the report lists where it looked. The text report prints a line, `--format github` prints a `::warning` for each, and `compare`, `diff` and the Action's comment show them too. The run fails when no target has one.

## Ignoring findings

Some findings are fine: a package that is only loaded in development, or a code path you know never runs on the edge. Ignore them with a reason, so the next person knows why.

```ts
export default defineConfig({
  ignore: [
    // Every finding in one package
    { package: 'chokidar', reason: 'only imported by the dev server' },
    // One API everywhere
    { api: 'node:fs.watch', reason: 'guarded by a runtime check' },
    // Every member of a module, in one package
    { package: 'pg', api: 'node:net.*', reason: 'we use the Hyperdrive socket instead' },
    // Your own code
    { package: '.', api: 'node:child_process*' },
  ],
});
```

- `package` matches the package name. Use `.` for your own code.
- `api` matches the API as it appears in the report. A trailing `*` matches a prefix.
- A rule with both matches only when both match.

Ignored findings are counted in the report header and in the JSON output as `ignored`, so they do not disappear without a trace.

## Levels

Each category has a default level. Set any of them to `error`, `warning` or `off`.

```ts
export default defineConfig({
  levels: {
    mocked: 'warning',
    mismatch: 'error',
    unknown: 'off',
  },
});
```

| Category      | Default |
| ------------- | ------- |
| `unsupported` | error   |
| `mocked`      | error   |
| `mismatch`    | warning |
| `web`         | warning |
| `unknown`     | warning |

Only error-level findings make `edgefit check` exit with `1`.

## Runtime settings

### Cloudflare Workers

```ts
export default defineConfig({
  workerd: {
    compatibilityDate: '2026-04-01',
    compatibilityFlags: ['nodejs_compat'],
    wranglerConfig: 'wrangler.production.jsonc',
  },
});
```

By default these come from `wrangler.jsonc`, `wrangler.json` or `wrangler.toml` in the root, then from the data's own settings. Set `wranglerConfig: false` to ignore the wrangler config.

### Bun

```ts
export default defineConfig({
  bun: { version: '1.4.2' },
});
```

By default the version comes from `packageManager: "bun@x"` in `package.json`, or from `.bun-version`. It is only used to warn you when your Bun is older than the data.

### Deno

```ts
export default defineConfig({
  deno: { configFile: 'deno.jsonc' },
});
```

Used by both `deno` and `deno-deploy`. By default edgefit looks for `deno.json`, then `deno.jsonc`, in the root. Set `configFile: false` to skip the import map.

### Netlify

```ts
export default defineConfig({
  netlify: { configFile: 'netlify.toml' },
});
```

Used by `netlify-edge`. By default edgefit looks for `netlify.toml` in the root, for the edge functions and the `deno_import_map` file. Set `configFile: false` to skip it. See [Netlify Edge Functions](/targets/netlify-edge).

## Environment

edgefit treats `process.env.NODE_ENV` as a constant, as the platform's production build does, so code that only runs in development is not checked. The default is what the platform's build uses: `production` on `workerd`, `netlify-edge` and `vercel-edge`. Bun and Deno set no value, so on `bun`, `deno` and `deno-deploy` both branches of a check are followed. The report says which one was used. To set a value, for example to check the development build:

```ts
export default defineConfig({
  env: { NODE_ENV: 'development' },
});
```

## Export conditions

Add conditions that are checked before the target's own, for example when your bundler is configured with a custom one:

```ts
export default defineConfig({
  conditions: ['edge-light'],
});
```

See the [config reference](/reference/config) for every option in one place.
