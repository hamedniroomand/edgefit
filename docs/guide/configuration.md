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

- `targets` defaults to `['workerd']`. The valid names are `workerd`, `bun`, `deno` and `deno-deploy`.
- `entry` is relative to the project root. Without it, edgefit uses wrangler's `main`. One entry is scanned for every target, so a project with a wrangler config can check Bun and Deno without repeating it.

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

## Export conditions

Add conditions that are checked before the target's own, for example when your bundler is configured with a custom one:

```ts
export default defineConfig({
  conditions: ['edge-light'],
});
```

See the [config reference](/reference/config) for every option in one place.
