# JSON reports

Every command that takes `--format json` prints a versioned object. `version` changes only on breaking changes to the shape. `edgefit diff` reads reports of version 1 and 2, so a base report written before version 2 still works as the base.

| Version | Change                                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 2       | Each target lists `entries` where version 1 had one `entry`. A version 1 report is read as `entries: [entry]`. `compare` and `diff` follow |

## Schema and stability

The schema of the `check` report, version 2, is at [`/schema/report-v2.json`](https://edgefit.kitdev.space/schema/report-v2.json). It is JSON Schema draft-07. A later report version gets its own file, so this URL never changes meaning. The schema lists the required fields and allows unknown fields, so a report with a new field still validates.

The npm package includes the schema of the version you install. Import it as `edgefit/schema/report-v2.json` to validate a report offline.

A test in the edgefit repository checks reports from real fixture projects against a strict copy of the schema that rejects unknown fields. A change to the report fails the build unless the schema changes with it.

A change is breaking when it removes a field, renames a field, changes the type of a field, or changes what a value means. A breaking change raises `version`. Adding a field, adding a value to `category` or `suggestion.kind`, and adding a target is not breaking. Read a report with code that ignores fields it does not know.

## check

```sh
edgefit check --format json
```

```json
{
  "version": 2,
  "summary": { "errors": 1, "warnings": 1 },
  "targets": [
    {
      "key": "workerd",
      "platform": "Cloudflare Workers",
      "conditions": ["workerd", "worker", "browser"],
      "data": "workers-nodejs-compat-matrix@ee58120 (workerd 1.20260929.1), ...",
      "settings": "compatibility_date 2026-09-29, flags: nodejs_compat (from wrangler.jsonc)",
      "notes": [],
      "entries": ["src/index.ts"],
      "modules": 5,
      "ignored": 0,
      "guarded": [],
      "suppliedLoads": [],
      "findings": [
        {
          "id": "ef_3fa09c21b7",
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
          "source": "https://github.com/cloudflare/workerd/tree/v1.20260929.1/src/node/internal/internal_fs_callback.ts",
          "suggestion": {
            "kind": "change",
            "text": "chokidar watches files, which Workers cannot do. Import it from development tooling only, and keep it out of what the Worker's entry imports.",
            "target": "workerd",
            "source": "https://github.com/paulmillr/chokidar/blob/4.0.3/README.md"
          }
        }
      ]
    }
  ]
}
```

`skipped` lists the targets left out because they have no entry, each as `{ key, searched }`, where `searched` names the places the target looked. It is empty when every target ran. `failed` lists the targets whose module graph could not be resolved while other targets were checked, each as `{ target, message, hint? }`. It is left out when every target was checked, and the exit code is 2 when it is there.

`entries` lists every entry the target was checked from, relative to the root, sorted. A target that has no entry of its own and uses another target's lists those.

`guarded` has the same shape as `findings` and holds usages that do not fail the check because the code guards them: it only runs when the API exists, catches the error of its absence, or only runs on another runtime (see [guarded usages](/guide/findings#guarded-usages)). They are not counted in `summary` and never fail a check.

`suppliedLoads` lists each `require()` or `import()` of a name that the user of the code gives, as `{ "package": "express", "place": "view.js:81" }`. `package` is left out for the code of the project. These are not findings. See [modules that the user names](/guide/packages#modules-that-the-user-names).

### Finding

| Field            | Type                    | Description                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | `string`                | A short ID such as `ef_3fa09c21b7`. It is the same in every run for the same target, category, API and owner (the package, the file for your own code, or `build output` for code that no sourcemap maps to a file). Versions and line numbers do not change it. It is unique in `findings` and unique in `guarded`. When some uses of an API have a guard and some do not, the same `id` is in both lists |
| `category`       | `string`                | `unsupported`, `mocked`, `mismatch`, `web` or `unknown`                                                                                                                                                                                                                                                                                                                                                    |
| `level`          | `string`                | `error` or `warning`                                                                                                                                                                                                                                                                                                                                                                                       |
| `api`            | `string`                | The API, such as `node:fs.watch` or `require(<expression>)`                                                                                                                                                                                                                                                                                                                                                |
| `target`         | `string`                | The target key                                                                                                                                                                                                                                                                                                                                                                                             |
| `message`        | `string`                | A full sentence, including the API                                                                                                                                                                                                                                                                                                                                                                         |
| `detail`         | `string`                | What is wrong, without the API                                                                                                                                                                                                                                                                                                                                                                             |
| `package`        | `object \| undefined`   | `{ name, version }` of the owning package. Absent for your own code                                                                                                                                                                                                                                                                                                                                        |
| `location`       | `object`                | `{ file, line, column }`, relative to the root, with `/` separators                                                                                                                                                                                                                                                                                                                                        |
| `otherLocations` | `object[]`              | Other places the same package uses the same API                                                                                                                                                                                                                                                                                                                                                            |
| `chain`          | `string[]`              | Import chain from the entry                                                                                                                                                                                                                                                                                                                                                                                |
| `source`         | `string \| undefined`   | Link to the runtime source behind a curated result                                                                                                                                                                                                                                                                                                                                                         |
| `suggestion`     | `object \| undefined`   | What to do about it: `{ kind, text, target, source }`, plus `package` for a `replace` and `setting` (`{ name, value }`, with `remove: true` when the value is to be taken out) for a `setting`. Never set on `guarded` entries                                                                                                                                                                             |
| `buildOutput`    | `true \| undefined`     | Set when the code is in build output that no sourcemap maps to a file of the project. It has no `package`, and reports show `build output` as its owner                                                                                                                                                                                                                                                    |
| `exports`        | `string[] \| undefined` | The exports of the checked package that reach this finding, when only some of them do. Set only by `edgefit package`, and by `check` with `byExport`                                                                                                                                                                                                                                                       |
| `unreached`      | `object \| undefined`   | `{ reason, source }`, set on a `guarded` entry that [edgefit's data](/guide/findings#code-a-package-ships-and-the-target-does-not-run) says the target never runs                                                                                                                                                                                                                                          |
| `guarded`        | `true \| undefined`     | Set on entries of `guarded`                                                                                                                                                                                                                                                                                                                                                                                |

## compare

```json
{
  "version": 2,
  "targets": ["workerd", "bun", "deno"],
  "skipped": [],
  "apis": [
    {
      "api": "node:fs.watch",
      "packages": ["chokidar"],
      "results": { "workerd": "unsupported", "bun": "supported", "deno": "supported" }
    }
  ]
}
```

`skipped` is the same list as in the `check` report. Each value in `results` is a category or `supported`. A target that does not reach the API, or where the finding was ignored or turned off, is left out of `results`.

## package

`edgefit package <name> --format json`. It has its own `version`, bumped on a breaking change.

```json
{
  "version": 2,
  "package": "@scope/name",
  "resolved": "2.3.1",
  "checkedAt": "2026-09-30T12:00:00.000Z",
  "edgefit": "0.5.0",
  "data": { "workerd": "1.20260929.1", "bun": "1.4.2", "deno": "2.9.7" },
  "targets": ["workerd", "bun", "deno"],
  "summary": { "workerd": "pass", "bun": "pass", "deno": "warn" },
  "worst": { "workerd": { "subpath": "./node", "status": "fail" } },
  "worstExport": { "workerd": { "subpath": ".", "name": "createServer", "status": "warn" } },
  "context": { "workerd": { "settings": "compatibility_date …", "notes": [] } },
  "entries": [
    {
      "subpath": ".",
      "specifier": "@scope/name",
      "results": {
        "workerd": {
          "status": "pass",
          "errors": 0,
          "warnings": 0,
          "exports": [
            {
              "name": "createServer",
              "level": "warning",
              "findings": [
                {
                  "api": "node:net.createServer",
                  "category": "mismatch",
                  "level": "warning",
                  "detail": "listen() works only on a port the platform declares"
                }
              ]
            }
          ]
        }
      }
    }
  ]
}
```

`status` is `pass`, `warn` (warnings only), `fail` (an error), `error` (the entry could not be checked, with a `message`) or `unchecked` (the entry needs a module that the package does not declare, with a `message`). `summary` is the status of the main entry for each target, or of the worst entry for a package without a checked main entry. `worst` names the worst entry of a target, and is only there when it is worse than `summary`. `main` is the subpath that decides `summary` when it was named with `--main`, and is left out otherwise. `exports` lists the findings that only some exports of the entry reach, by export. They do not change `status` or the counts. `worstExport` names the export with the worst findings among all entries of a target, with the status of its worst finding, and is only there when it is worse than `summary`. `resolved` is the installed version, never the requested range.

The table's `results.json` lists one row per package with `name`, `file`, `resolved`, `summary`, `worst`, `worstExport`, `subpaths`, `main` when the row names one, and `error` when the package could not be installed or checked.

## diff

```json
{
  "version": 2,
  "targets": ["workerd"],
  "new": [],
  "fixed": [],
  "unchanged": [],
  "skipped": []
}
```

Each list holds findings in the same shape as `check`. `targets` are the head report's targets, and `skipped` is the head report's `skipped`: the targets left out because they have no entry. The text and GitHub output print them, so the Action's pull request comment shows them. A report written before `skipped` existed has none.
