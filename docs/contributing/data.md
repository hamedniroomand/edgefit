# Compatibility data

The quality of edgefit's results is the quality of its data. This page explains where the data lives, how to change it, and how it is kept honest.

## Where it lives

Everything is in `packages/edgefit/data`:

| Path                            | What it is                                                    |
| ------------------------------- | ------------------------------------------------------------- |
| `source.json`                   | Every data source with its URL, version, commit and license   |
| `workers-nodejs-compat-matrix/` | The vendored matrix: a Node baseline and one dump per runtime |
| `runtime-compat-data/`          | The vendored Web API data, as published                       |
| `overrides/<target>.json`       | Curated corrections per target                                |

`edgefit targets` prints what `source.json` says, so users can see exactly which data produced their results.

## Override files

The matrix only records whether an API exists. Override files record what happens when it is called:

```json
{
  "modules": {
    "child_process": {
      "status": "unsupported",
      "note": "every child_process function throws ERR_METHOD_NOT_IMPLEMENTED; Workers cannot spawn processes",
      "source": "child_process.ts",
      "except": []
    }
  },
  "apis": {
    "fs.watch": {
      "status": "unsupported",
      "note": "file watching is not implemented; throws ERR_UNSUPPORTED_OPERATION",
      "source": "internal/internal_fs_callback.ts"
    }
  }
}
```

- `modules` covers a whole module, minus the members in `except`.
- `apis` covers one member.
- `status` is `unsupported`, `mocked`, `mismatch` or `supported`.
- `note` is the detail line users see. Say what happens, in plain words.
- `source` is a path relative to the source URL in `source.json`, pinned to the runtime version. It becomes the `see` link in reports.

### Adding or changing an entry

1. Find the code in the runtime's source at the pinned version, not at `main`.
2. Add the entry with a `note` that describes the behavior and a `source` that points to that file.
3. Add or update a test in `packages/edgefit/test` that shows the finding.
4. In the pull request, link the lines you read.

Entries without a source are not accepted. The whole point of an override is that anyone can check it.

## Runtime probes

Reading source by hand is slow and misses things, so a workflow checks the overrides against the real runtimes. It lives in `.github/workflows/probe.yml` and runs weekly and on demand.

For each of Bun, Deno and workerd, it installs the runtime, imports each API inside it, calls functions with no arguments and constructs classes, and classifies what happens:

| Outcome                                                                                                       | Result         |
| ------------------------------------------------------------------------------------------------------------- | -------------- |
| Import or member lookup fails                                                                                 | `missing`      |
| Throws `ERR_NOT_IMPLEMENTED`, `ERR_METHOD_NOT_IMPLEMENTED`, `ERR_UNSUPPORTED_OPERATION`, or "not implemented" | `unsupported`  |
| Throws an argument error such as `ERR_INVALID_ARG_TYPE`                                                       | `implemented`  |
| Returns, or throws anything else                                                                              | `inconclusive` |

Dangerous APIs such as `process.exit`, `child_process.*` and `fs` writes are only looked up, never called.

The workflow runs twice per runtime:

- **pinned** probes the versions in `source.json` and lists every disagreement with the overrides in the job summary.
- **latest** probes the newest release and lists curated stubs that now work, which is the signal to bump the data. It also runs a small targeted check for each `mocked` entry.

Nothing is committed automatically. Probe results are evidence for reviewers. edgefit itself never reads them when checking a project, so results only ever come from the reviewed override files.

The probe code is in `packages/edgefit/scripts/probe`.

## Bumping a data source

1. Replace the vendored files with the new release.
2. Update the version, commit and date in `source.json`.
3. Update the override files' source URLs to the new tag, and review every entry against the new source. A pinned probe run on the new version shows which ones changed.
4. Run the tests and compare results on the fixture projects. Explain every change in the pull request.
