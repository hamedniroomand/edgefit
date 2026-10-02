# Compatibility data

The quality of edgefit's results is the quality of its data. This page explains where the data lives, how to change it, and how it is kept honest.

## Where it lives

Everything is in `data`:

| Path                            | What it is                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `source.json`                   | Every data source with its URL, version, commit and license                            |
| `workers-nodejs-compat-matrix/` | The vendored matrix: a Node baseline and one dump per runtime                          |
| `runtime-compat-data/`          | The vendored Web API data, as published                                                |
| `overrides/<target>.json`       | Curated corrections per target                                                         |
| `suggestions.json`              | Reviewed fixes for packages and APIs, see [Suggested fixes](/contributing/suggestions) |
| `allowlists/<target>.json`      | For a runtime with no dump: what its documentation allows                              |

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

## Runtimes without a dump

Vercel Edge has no matrix dump, so `allowlists/vercel-edge.json` lists what its documentation allows and a provider (`src/data/providers/allowlist.ts`) builds a dump from the Node baseline with everything else removed. The file has one list per kind of evidence:

- `modules` maps each allowed module to the members that exist on it (or to `true` for all of them). The documentation says which modules; the members come from `members.sources`, two pieces of the vendor's own code that list them.
- `globals` are the names in the documentation's tables, and `Buffer`.
- `languageGlobals` are the ECMAScript builtins of a fresh V8 context, and `emulatorGlobals` are web globals the vendor's emulator has and the tables omit.
- `docs.moduleDescriptions` are hashes of the documentation's description of each module, so the weekly check notices a changed sentence. `emulator` pins the emulator release.

A list that falls behind the platform reports an API as missing that exists, never the reverse, so a mistake here shows to users as a false error. Keep the `source.json` date in step with the page you read.

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

### Production witness

Netlify and Vercel publish no runtime to install, so a small function deployed on each platform reports what production has. The **Witness** workflow (`.github/workflows/witness.yml`) deploys it to a Netlify site as an edge function, and to a Vercel project as middleware and as an edge route. Run the workflow by hand when the witness code or its list of APIs changes. Only this workflow needs the platform tokens.

The witness only looks APIs up. It never calls them, because the endpoint is public. It reports:

- the Deno version (Netlify), and each place the runtime reports a version as evidence. Netlify hides `Deno.version.deno`, so the version can be missing.
- the names on the global object. On a Vercel edge route, `globalThis` hides most of its own names, so only the middleware names are compared.
- a lookup of each API in its list: every module and member in the Node baseline on Netlify, and on Vercel each global the data keeps and the members of the allowed modules
- whether `eval`, `new Function`, `WebAssembly.compile` and `WebAssembly.instantiate` from bytes run
- on Vercel, whether the `require` global loads a module
- on Netlify, the `run`, `write` and `env` permissions, `Deno.execPath()`, and whether a subprocess and a file write run

The weekly Probe run reads the witness with no secret, in the `witness` jobs, and compares the answer with the data in the job summary. Each answer has a hash of the list of APIs that the witness was built with. When the hash does not match the repository, the summary says to redeploy. The witness is not part of the drift issue. A witness that does not answer gives a warning, so you can remove the witness and the results do not change.

The code is in `scripts/probe/witness`.

## Bumping a data source

The matrix provider's repository may lag behind the runtimes. Check its newest commit first: if it has newer dumps, vendor those. If it does not, regenerate the runtime dumps with its own scripts, at the commit `source.json` names:

1. Run the **Dump data** workflow with the runtime versions you want. It checks out the provider at the commit in `source.json` and runs its dump scripts on Linux, which is how the provider makes them.
2. Download its `runtime-dumps` artifact. Do not dump on a laptop: macOS lacks Linux-only constants and a terminal changes `process.stdin`, so the dump would disagree with the probe. The maintenance runbook has the details, and how to dump by hand in a container.
3. Copy the three dumps to `data/workers-nodejs-compat-matrix`, keeping the file formatting.
4. In `source.json`, update `generatedAt`, the runtime versions, the workerd compatibility date, and the override sources' tags. Say in `note` how the data was generated.
5. Check that every override `source` still exists at the new tag. Files move: Bun's `src/bun.js` became `src/jsc`.
6. Review every override against the new source, and run a `pinned` probe on the new versions (see below). It lists overrides that no longer match. A stub that now works is removed, and one that changed is corrected. A stub that validates its arguments before it throws gets `"validatesFirst": true`, so the probe does not read its argument error as a working implementation.
7. Run the tests and compare results on the fixture projects. Explain every change in the pull request.
