# JavaScript API

Everything the CLI does is available from code. The package is ESM only.

```ts
import { check, countLevels, formatReport, loadConfig } from 'edgefit';

const root = process.cwd();
const { config } = await loadConfig(root);
const result = await check({ root, config });

console.log(formatReport(result, 'text', { color: false }));

const { errors } = countLevels(result);
process.exitCode = errors > 0 ? 1 : 0;
```

## check(options)

Scans a project and returns one report per target.

```ts
function check(options?: CheckOptions): Promise<CheckResult>;
```

| Option             | Type            | Description                                                          |
| ------------------ | --------------- | -------------------------------------------------------------------- |
| `root`             | `string`        | Project root. Default: `process.cwd()`                               |
| `config`           | `EdgefitConfig` | The same shape as the config file. It is not loaded for you          |
| `built`            | `string`        | Scan build output: its entry file or directory, relative to the root |
| `includeSupported` | `boolean`       | Also list the reached APIs each target supports, in `supported`      |

```ts
interface CheckResult {
  root: string;
  reports: TargetReport[];
}

interface TargetReport {
  target: TargetInfo;
  entry: string;
  modules: number;
  findings: Finding[];
  ignored: number;
  supported: SupportedApi[];
}
```

`Finding` has the same fields as in the [JSON report](/reference/json#finding).

## loadConfig(root, file?)

Finds and loads `edgefit.config.{ts,mts,js,mjs}` in `root`, or the given file, and validates it.

```ts
function loadConfig(
  root: string,
  file?: string,
): Promise<{ file: string | undefined; config: EdgefitConfig }>;
```

Without a config file, it returns `{ file: undefined, config: {} }`.

## formatReport(result, format, options)

Renders a result the way the CLI does.

```ts
function formatReport(
  result: CheckResult,
  format: 'text' | 'json' | 'github',
  options: { color: boolean },
): string;
```

## countLevels(result)

```ts
function countLevels(result: CheckResult): { errors: number; warnings: number };
```

## defineConfig(config)

Returns the config unchanged. It exists for types in `edgefit.config.ts`.

## EdgefitError

Thrown for problems with the input rather than bugs: a missing entry, an invalid config, a project that cannot be resolved. It may carry a `hint` with the next step to take. The CLI prints both and exits with `2`.

```ts
try {
  await check({ root });
} catch (error) {
  if (error instanceof EdgefitError) {
    console.error(error.message);
  } else {
    throw error;
  }
}
```

## Types

All public types are exported: `EdgefitConfig`, `CheckOptions`, `CheckResult`, `TargetReport`, `TargetInfo`, `Finding`, `Category`, `Level`, `TargetKey`, `IgnoreRule`, `Location`, `PackageInfo`, `SupportedApi` and `ReportFormat`.
