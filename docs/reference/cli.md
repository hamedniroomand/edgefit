# CLI

```
edgefit <command> [options]
```

| Command               | What it does                                                |
| --------------------- | ----------------------------------------------------------- |
| [`check`](#check)     | Scan a project from its entry point                         |
| [`compare`](#compare) | Show the reached APIs side by side across targets           |
| [`diff`](#diff)       | Show what changed between two `check --format json` reports |
| [`targets`](#targets) | List the supported targets and the data behind each         |
| `help`                | Show the help text                                          |

## check

```sh
edgefit check [options]
```

| Option              | Description                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `--target <name>`   | Target runtime: `workerd`, `bun`, `deno`, `deno-deploy`. Repeat it for more than one. Default: the config's `targets`, then `workerd` |
| `--entry <file>`    | Entry point. Default: the config's `entry`, then wrangler's `main`                                                                    |
| `--built <path>`    | Scan build output instead of source: its entry file or directory. See [build output](/guide/built-output)                             |
| `--root <dir>`      | Project root. Default: the current directory                                                                                          |
| `--config <file>`   | Config file. Default: `edgefit.config.{ts,mts,js,mjs}` in the root                                                                    |
| `--format <format>` | `text`, `json` or `github`. Default: `text`                                                                                           |
| `--verbose`         | List [guarded](/guide/findings#guarded-usages) findings, which are otherwise only counted                                             |
| `--no-color`        | Disable colors                                                                                                                        |

`--entry` and `--built` cannot be combined.

```sh
edgefit check
edgefit check --entry src/index.ts --target workerd --target bun
edgefit check --built .output/server
edgefit check --format json > report.json
```

## compare

```sh
edgefit compare [target...] [options]
```

| Option              | Description                                           |
| ------------------- | ----------------------------------------------------- |
| `[target...]`       | Targets to compare. Default: `workerd`, `bun`, `deno` |
| `--all`             | Include APIs that every target supports               |
| `--verbose`         | List the packages and findings behind each row        |
| `--format <format>` | `text` or `json`. Default: `text`                     |

`--entry`, `--root`, `--config` and `--no-color` work as for `check`. See [Comparing targets](/guide/compare).

## diff

```sh
edgefit diff <base.json> <head.json> [options]
```

| Option              | Description                                                                           |
| ------------------- | ------------------------------------------------------------------------------------- |
| `--fail-on <when>`  | `new-errors`, `errors` or `never`. Default: `new-errors`                              |
| `--format <format>` | `text`, `json` or `github`. `github` annotates only the new findings. Default: `text` |
| `--no-color`        | Disable colors                                                                        |

Both files must be written by `edgefit check --format json` with the same edgefit version. See [Pull request checks](/guide/ci).

## targets

```sh
edgefit targets
```

Prints every target with its export conditions and data, then every data source with its version and license.

## Output formats

| Format   | Use it for                                                                                 |
| -------- | ------------------------------------------------------------------------------------------ |
| `text`   | Reading in a terminal                                                                      |
| `json`   | Tools and `edgefit diff`. The shape is versioned, see [JSON reports](/reference/json)      |
| `github` | GitHub Actions. Prints `::error` and `::warning` workflow commands that become annotations |

## Colors

Colors are on when stdout is a terminal. They are off when `--no-color` is passed or the `NO_COLOR` environment variable is set to a non-empty value.

## Exit codes

| Code | Meaning                                                                |
| ---- | ---------------------------------------------------------------------- |
| `0`  | No error-level findings (for `diff`: nothing that matches `--fail-on`) |
| `1`  | Error-level findings (for `diff`: findings that match `--fail-on`)     |
| `2`  | Invalid arguments or config, or a project that could not be resolved   |
