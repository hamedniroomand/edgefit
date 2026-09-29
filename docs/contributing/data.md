# Compatibility data

The quality of edgefit's results is the quality of its data. This page explains where the data lives, how to change it, and how it is kept honest.

## Where it lives

Everything is in `data`:

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
- `validatesFirst` (optional) marks a stub that checks its arguments before it throws, as workerd's `vm.compileFunction` does. The runtime probe then does not take an argument error for a working implementation.

### Adding or changing an entry

1. Find the code in the runtime's source at the pinned version, not at `main`.
2. Add the entry with a `note` that describes the behavior and a `source` that points to that file.
3. Add or update a test in `test` that shows the finding.
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

- **pinned** probes the versions in `source.json` and lists every disagreement with the overrides and the matrix in the job summary.
- **latest** probes the newest release and lists what differs from the pinned data. For workerd it uses the newest compatibility date that release accepts, since newer dates turn features on.

Both channels also look up every API the runtime's data marks as missing (Web APIs like `crypto.subtle.getPublicKey` included, and each global counted once), without calling it. A `missing` API that exists in the newest release is the clearest sign that the data is behind. The latest channel reports three kinds of drift:

- APIs the data marks missing that now exist
- curated stubs that now work, which means the probe got an argument error from real code (an inconclusive result is not counted)
- `mocked` entries the targeted check found implemented

Every Monday, and on a manual run with **open-issue** ticked, a last job collects the latest results and keeps one issue, labelled `data`, up to date with them. It opens the issue when there is drift, edits it on later weeks, and closes it when the data agrees with the newest releases again.

The [maintenance runbook](/contributing/maintenance) explains how to read the drift issue and what to do about each list.

Nothing is committed automatically. Probe results are evidence for reviewers. edgefit itself never reads them when checking a project, so results only ever come from the reviewed override files.

The probe code is in `scripts/probe`.

## Bumping a data source

The matrix provider's repository may lag behind the runtimes. Check its newest commit first: if it has newer dumps, vendor those. If it does not, regenerate the runtime dumps with its own scripts, at the commit `source.json` names:

1. Clone the provider at that commit. Its `node/dump.mjs`, `bun/dump.js`, `deno/dump.js` and `workerd/dump.mjs` write `data/<runtime>.json`. The Node baseline stays as it is.
2. Run each script with the release you want: `bun run bun/dump.js`, `deno run --allow-write=./data/deno.json --allow-read --allow-env --allow-sys deno/dump.js` (Deno 2.9 needs `--allow-sys`), and `node workerd/dump.mjs <date>` after installing that `workerd` version, where `<date>` is the release's date.
3. Copy the dumps to `data/workers-nodejs-compat-matrix`, keeping the file formatting.
4. In `source.json`, update `generatedAt`, the runtime versions, the workerd compatibility date, and the override sources' tags. Say in `note` how the data was generated.
5. Check that every override `source` still exists at the new tag. Files move: Bun's `src/bun.js` became `src/jsc`.
6. Review every override against the new source, and run a `pinned` probe on the new versions (see below). It lists overrides that no longer match. A stub that now works is removed, and one that changed is corrected. A stub that validates its arguments before it throws gets `"validatesFirst": true`, so the probe does not read its argument error as a working implementation.
7. Run the tests and compare results on the fixture projects. Explain every change in the pull request.
