# JSON reports

Every command that takes `--format json` prints a versioned object. `version` changes only on breaking changes to the shape, and `edgefit diff` refuses to compare reports of different versions.

## check

```sh
edgefit check --format json
```

```json
{
  "version": 1,
  "summary": { "errors": 1, "warnings": 1 },
  "targets": [
    {
      "key": "workerd",
      "platform": "Cloudflare Workers",
      "conditions": ["workerd", "worker", "browser"],
      "data": "workers-nodejs-compat-matrix@ee58120 (workerd 1.20260424.1), ...",
      "settings": "compatibility_date 2026-04-24, flags: nodejs_compat (from wrangler.jsonc)",
      "notes": [],
      "entry": "src/index.ts",
      "modules": 5,
      "ignored": 0,
      "guarded": [],
      "findings": [
        {
          "category": "unsupported",
          "level": "error",
          "api": "node:fs.watch",
          "target": "workerd",
          "message": "node:fs.watch file watching is not implemented; throws ERR_UNSUPPORTED_OPERATION",
          "detail": "file watching is not implemented; throws ERR_UNSUPPORTED_OPERATION",
          "package": { "name": "chokidar", "version": "4.0.1" },
          "location": { "file": "node_modules/chokidar/index.js", "line": 5, "column": 13 },
          "otherLocations": [],
          "chain": ["src/index.ts", "src/dev/reload.ts", "chokidar"],
          "source": "https://github.com/cloudflare/workerd/tree/v1.20260424.1/src/node/internal/internal_fs_callback.ts"
        }
      ]
    }
  ]
}
```

`guarded` has the same shape as `findings` and holds usages of an API the target lacks, in code that only runs when the API exists (see [guarded usages](/guide/findings#guarded-usages)). They are not counted in `summary` and never fail a check.

### Finding

| Field            | Type                  | Description                                                         |
| ---------------- | --------------------- | ------------------------------------------------------------------- |
| `category`       | `string`              | `unsupported`, `mocked`, `mismatch`, `web` or `unknown`             |
| `level`          | `string`              | `error` or `warning`                                                |
| `api`            | `string`              | The API, such as `node:fs.watch` or `require(<expression>)`         |
| `target`         | `string`              | The target key                                                      |
| `message`        | `string`              | A full sentence, including the API                                  |
| `detail`         | `string`              | What is wrong, without the API                                      |
| `package`        | `object \| undefined` | `{ name, version }` of the owning package. Absent for your own code |
| `location`       | `object`              | `{ file, line, column }`, relative to the root, with `/` separators |
| `otherLocations` | `object[]`            | Other places the same package uses the same API                     |
| `chain`          | `string[]`            | Import chain from the entry                                         |
| `source`         | `string \| undefined` | Link to the runtime source behind a curated result                  |
| `guarded`        | `true \| undefined`   | Set on entries of `guarded`                                         |

## compare

```json
{
  "version": 1,
  "targets": ["workerd", "bun", "deno"],
  "apis": [
    {
      "api": "node:fs.watch",
      "packages": ["chokidar"],
      "results": { "workerd": "unsupported", "bun": "supported", "deno": "supported" }
    }
  ]
}
```

Each value in `results` is a category or `supported`. A target that does not reach the API, or where the finding was ignored or turned off, is left out of `results`.

## diff

```json
{
  "version": 1,
  "targets": ["workerd"],
  "new": [],
  "fixed": [],
  "unchanged": []
}
```

Each list holds findings in the same shape as `check`. `targets` are the head report's targets.
