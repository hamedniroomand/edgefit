# Config options

Every option of `edgefit.config.ts`. For examples and explanations, see [Configuration](/guide/configuration).

```ts
import { defineConfig } from 'edgefit';

export default defineConfig({
  targets: ['workerd'],
  entry: 'src/index.ts',
  workerd: { compatibilityDate: '2026-04-01', compatibilityFlags: ['nodejs_compat'] },
  bun: { version: '1.4.2' },
  deno: { configFile: 'deno.json' },
  ignore: [{ package: 'chokidar', reason: 'dev server only' }],
  levels: { mocked: 'error', unknown: 'warning' },
  conditions: [],
});
```

## Top level

| Option       | Type                               | Default         | Description                                                                               |
| ------------ | ---------------------------------- | --------------- | ----------------------------------------------------------------------------------------- |
| `targets`    | `TargetKey[]`                      | `['workerd']`   | `workerd`, `bun`, `deno`, `deno-deploy`, `netlify-edge`, `vercel-edge`. Must not be empty |
| `entry`      | `string`                           | wrangler `main` | Entry point, relative to the root                                                         |
| `ignore`     | `IgnoreRule[]`                     | `[]`            | Findings to leave out of the report                                                       |
| `levels`     | `Partial<Record<Category, Level>>` | see below       | Level per category: `error`, `warning` or `off`                                           |
| `conditions` | `string[]`                         | `[]`            | Extra export conditions, checked before the target's own                                  |
| `workerd`    | `WorkerdOptions`                   |                 | Cloudflare Workers settings                                                               |
| `bun`        | `BunOptions`                       |                 | Bun settings                                                                              |
| `deno`       | `DenoOptions`                      |                 | Settings for `deno` and `deno-deploy`                                                     |
| `netlify`    | `NetlifyOptions`                   |                 | Settings for `netlify-edge`                                                               |

## `ignore`

| Field     | Type     | Description                                                                       |
| --------- | -------- | --------------------------------------------------------------------------------- |
| `package` | `string` | Package name. `.` means your own code                                             |
| `api`     | `string` | API as shown in reports, such as `node:fs.watch`. A trailing `*` matches a prefix |
| `reason`  | `string` | Why. Not used by edgefit, but the next reader will thank you                      |

Each rule needs `package`, `api`, or both.

## `levels`

| Category      | Default   |
| ------------- | --------- |
| `unsupported` | `error`   |
| `mocked`      | `error`   |
| `mismatch`    | `warning` |
| `web`         | `warning` |
| `unknown`     | `warning` |

## `workerd`

| Field                | Type              | Default                                                                            |
| -------------------- | ----------------- | ---------------------------------------------------------------------------------- |
| `compatibilityDate`  | `string`          | wrangler `compatibility_date`, then the data's                                     |
| `compatibilityFlags` | `string[]`        | wrangler `compatibility_flags`, then the data's                                    |
| `wranglerConfig`     | `string \| false` | `wrangler.jsonc`, `wrangler.json` or `wrangler.toml` in the root. `false` skips it |

## `bun`

| Field     | Type     | Default                                        |
| --------- | -------- | ---------------------------------------------- |
| `version` | `string` | `packageManager: "bun@x"`, then `.bun-version` |

## `deno`

| Field        | Type              | Default                                                      |
| ------------ | ----------------- | ------------------------------------------------------------ |
| `configFile` | `string \| false` | `deno.json`, then `deno.jsonc` in the root. `false` skips it |

## `netlify`

| Field        | Type              | Default                                                         |
| ------------ | ----------------- | --------------------------------------------------------------- |
| `configFile` | `string \| false` | `netlify.toml` in the root. `false` skips it and its import map |

## Validation

The config is validated when it is loaded. Unknown targets, unknown categories, invalid levels and ignore rules without `package` or `api` are rejected with exit code `2` and a message naming the problem.
