# Keeping the data current

edgefit is only as good as its picture of the runtimes, and the runtimes move every week. This page is the runbook for keeping up: how the weekly check works, how to read its issue, how to decide what each entry means, and which code and tests change with a data bump.

## The moving parts

| Piece                                      | What it is                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `data/workers-nodejs-compat-matrix/*.json` | One dump of Node's API tree per runtime (`bun`, `deno`, `workerd`) and a Node `baseline` |
| `data/overrides/<target>.json`             | What the matrix cannot say: APIs that exist but throw, do nothing, or differ             |
| `data/source.json`                         | The versions, commit and date every file was made from. `edgefit targets` prints it      |
| `scripts/probe`                            | Runs real runtimes and compares them with the data                                       |
| `.github/workflows/probe.yml`              | The weekly run. Its last job keeps one issue up to date                                  |

The matrix answers "does this API exist?". The overrides answer "what happens when it is called?". The probe checks both against the real thing, and never changes data by itself.

## The weekly loop

Every Monday the **Probe** workflow runs each runtime twice:

- **pinned** runs the versions in `source.json`. It should agree with the data. A disagreement here means a mistake in the data.
- **latest** runs the newest release. It shows what the data has fallen behind on.

A last job (`Data drift issue`) turns the latest results into one issue titled _The compatibility data is behind the latest runtimes_, labelled `data`. It opens the issue when there is drift, edits it on later weeks, and closes it when the data agrees again.

To run it yourself:

```sh
gh workflow run probe.yml --ref main -f open-issue=true    # also writes the issue
gh workflow run probe.yml --ref my-branch                  # a trial run that touches no issue
```

The complete lists are in the `drift.json` artifact of each `probe-<runtime>-latest` job. The issue shows the first members per module.

## Reading the issue

The issue has up to three lists per runtime.

### Marked missing in the data, but present in the latest release

The matrix says the API does not exist, and the newest release has it. This is the clearest sign the data is behind, and it is fixed by regenerating the runtime's dump (see [Bumping the data](#bumping-the-data)). A whole module of new members, such as `constants`, usually comes from one runtime release.

### Curated stubs that now work

An override says the API throws, and the probe got an argument error from real code. **This is a hint, not proof.** Many stubs check their arguments first and throw "not implemented" only when the arguments are valid. workerd's `vm.compileFunction` does this:

```ts
validateString(code, 'code');
validateObject(options, 'options');
// ...more validation...
throw new ERR_METHOD_NOT_IMPLEMENTED('compileFunction');
```

A bare call fails validation, so the probe sees an argument error and thinks the API works. Always read the source before removing an override (below).

### Mocked entries that are now implemented

A `mocked` override says the API does nothing. The targeted check in `scripts/probe/mocked-checks.mjs` found it doing real work now. Read the source, then remove or change the entry.

## Deciding what an entry means

For each flagged API, in this order:

1. **Read the runtime's source at the release tag.** The override's `source` field gives the file. Look for the `throw`, the `notImplemented(...)` call, or the real implementation. This settles most cases.
2. **Call it with real arguments** when the source is unclear. Run a small script in the runtime (`bun -e`, `deno eval`, or the probe's runner) and look at what it returns or throws.
3. **Pick the status** from what you found:

| What the API does                                                | Status                                 |
| ---------------------------------------------------------------- | -------------------------------------- |
| Works, or works for everything a project is likely to do         | remove the entry                       |
| Throws whatever you pass it                                      | `unsupported`                          |
| Returns without doing the work                                   | `mocked`                               |
| Works in part, or only under a condition                         | `mismatch`, and say what in the `note` |
| Value differs from Node but is not behavior (`process.versions`) | `supported`                            |

4. **Write the note in plain words** about what happens, not about the runtime's internals.
5. **Mark validate-first stubs** with `"validatesFirst": true`. The probe then does not read their argument error as a working implementation, and the drift report leaves them out.

Some rules of thumb from past bumps:

- A stub that throws `ERR_METHOD_NOT_IMPLEMENTED` **after** validation is still `unsupported`.
- `inconclusive` proves nothing. It means the call returned or threw something else.
- A class whose constructor works but whose methods throw is `unsupported` with a note that says so (workerd's `vm.Script`).
- Module-level entries (`"modules"`) are not checked by the probe. Review them by hand when a runtime changes a module (Bun's `repl`, `trace_events`, Deno's `cluster`, `wasi`).

## Bumping the data

Use this when the issue lists APIs the data says are missing, or when a runtime has changed enough to matter.

### 1. Find the data

The matrix comes from `cloudflare/workers-nodejs-compat-matrix`. Check its newest commit against `source.json`:

```sh
gh api repos/cloudflare/workers-nodejs-compat-matrix/commits --jq '.[0:5][] | "\(.sha[0:7]) \(.commit.committer.date) \(.commit.message | split("\n")[0])"'
```

If it has newer dumps, vendor them. If its newest commit is the one you already have, regenerate the runtime dumps with its own scripts.

### 2. Regenerate the dumps

The Node baseline (`baseline.json`) stays as it is. Only the runtimes change, and they must be dumped **on Linux with no terminal attached**. A dump made on a laptop is wrong in two ways: it lacks the Linux-only constants (`O_DIRECT`, `O_NOATIME`, `RTLD_DEEPBIND`, `SIGPWR`, `SIGPOLL`, `SIGSTKFLT`), and it lacks the `process.stdin` members that only exist when stdin is a pipe or file instead of a terminal. The probe runs on Linux, so it reports every one of them as drift.

Run the **Dump data** workflow, which does this with the provider's own scripts at the commit in `source.json`:

```sh
gh workflow run dump-data.yml -f workerd=1.20260929.1 -f bun=1.4.2 -f deno=2.9.7
gh run download <run id> -n runtime-dumps -D /tmp/dumps
```

The artifact has `bun.json`, `deno.json`, `workerd.json` and a `versions.txt` with the versions and the provider commit. The workflow commits nothing.

If you ever have to dump by hand, do it in a Linux container (`docker run --rm -i`, without `-t`, so stdin is not a terminal) with the provider's commands:

```sh
bun run bun/dump.js
deno run --allow-write=./data/deno.json --allow-read --allow-env --allow-sys deno/dump.js
(cd workerd && npm install workerd@<version> --no-save)
node workerd/dump.mjs <YYYY-MM-DD>       # the release's date, from 1.YYYYMMDD.N
```

Notes that cost time once:

- Deno 2.9 needs `--allow-sys`. The provider's own command does not have it.
- The npm `deno` package does not always have the newest release, so the workflow uses `setup-deno`.
- workerd warns that `nodejs_compat` is the default from 2026-08-04. That is harmless.
- **Check the result before vendoring**: compare the new dump with the old one and look at what went from present to missing. Real removals are rare. A list of constants or `stdin` members means the dump came from the wrong environment.

### 3. Vendor the files

Copy `bun.json`, `deno.json` and `workerd.json` from the artifact into `data/workers-nodejs-compat-matrix`, and keep the formatting: two-space indent and a final newline (`json.dumps(data, indent=2, ensure_ascii=False)` plus `\n` matches).

Then update `data/source.json`:

- the runtime `versions`, `generatedAt`, and the workerd `settings.compatibilityDate`
- the override sources' tags: `v<workerd version>`, `bun-v<version>`, `v<deno version>`
- a `note` that says how the dumps were made, if they were not taken from the provider as published

### 4. Check that override sources still exist

Files move between releases (Bun's `src/bun.js` became `src/jsc`). Check every `source` path at the new tag:

```sh
# workerd: https://raw.githubusercontent.com/cloudflare/workerd/v<version>/src/node/<source>
# bun:     https://raw.githubusercontent.com/oven-sh/bun/bun-v<version>/<source>
# deno:    https://raw.githubusercontent.com/denoland/deno/v<version>/ext/node/polyfills/<source>
curl -s -o /dev/null -w '%{http_code}\n' -I "<url>"
```

Anything that is not `200` needs its new path. To find it, list the tree: `gh api "repos/oven-sh/bun/git/trees/bun-v<version>?recursive=1" --jq '.tree[].path' | grep <name>`.

### 5. Review the overrides

Run a **pinned** probe on the new versions (next section) and go through every disagreement with [Deciding what an entry means](#deciding-what-an-entry-means). Edit `data/overrides/<target>.json`. A pinned probe with no disagreements is the goal.

### 6. Update what depends on the data

See [Code and tests that change with the data](#code-and-tests-that-change-with-the-data).

### 7. Run everything and explain

`vp run ready`, then check a few real projects (a Hono app, a Nitro app, a project you know) before and after. Explain every change to the overrides in the pull request, with the source line you read.

## Running the probe locally

Build a spec, run it in the runtime, then summarize:

```sh
node scripts/probe/apis-cli.mjs bun --drift --mocked > /tmp/spec-bun.json
bun scripts/probe/run.mjs /tmp/spec-bun.json /tmp/res-bun.json
node scripts/probe/summarize.mjs bun pinned /tmp/res-bun.json
```

- **Deno:** `deno run -A scripts/probe/run.mjs /tmp/spec-deno.json /tmp/res-deno.json`
- **workerd:** install the package in a scratch directory, then run `node scripts/probe/workerd/run.mjs <spec> <results>` from it. Set `PROBE_LATEST=1` to probe with the release's newest compatibility date, or leave it at `0` for the date in `source.json`.
- **Use absolute paths** for the results file. The runner changes directory before it writes.
- **`--drift`** adds a lookup of every API the data marks missing. **`--mocked`** adds the targeted checks for `mocked` entries. **`--discover`** probes every API in the baseline.
- `summarize.mjs <runtime> pinned` lists disagreements with the data. `summarize.mjs <runtime> latest` also writes `drift.json`, the input of the issue.

Set `PROBE_TRACE=1` to log each API before it is probed. If a run hangs, the last line names the call. The workflow already sets it and limits each probe job to 15 minutes.

### When a probe hangs

Some calls block for ever with no arguments. `inspector.waitForDebugger` waits for a debugger that never attaches, on the newest Bun. Such calls are only looked up, never called: add them to `isDenied` in `scripts/probe/classify.mjs`, with a test in `test/probe/classify.test.ts`.

### Two things the probe is careful about

- **Exact lookups.** The matrix records a module's named exports and its `default` separately. A lookup-only check therefore does not fall back to `default` for a name the namespace lacks. Calls still do.
- **Validate-first stubs and bare calls.** See above. A `mismatch` override is not compared with a bare call either, since a partial implementation cannot be confirmed that way.

## Code and tests that change with the data

A data bump touches more than JSON:

| Where                                     | What to update                                                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/targets/workerd/gates.ts`            | `flagsSource` points at the compatibility flags at a tag. Compare the gates first (below)                               |
| `test/targets/{workerd,bun,deno}.test.ts` | Versions and dates in expected text, curated examples that were removed or changed                                      |
| `test/cli/run.test.ts`                    | The version strings in `edgefit targets` and the "older than the data" notes                                            |
| `test/core/check.test.ts`                 | Web API findings per target (Deno gained `navigator.locks` in 2.9, for example)                                         |
| `docs/`                                   | The sample reports and the version numbers in `targets/*.md`, `getting-started.md`, `reference/*.md`                    |
| `docs/guide/status.md`, `README.md`       | The runtime versions, dump date and compatibility date. `test/docs/status.test.ts` fails until they match `source.json` |
| `CHANGELOG.md`                            | A **Data** section that says what users will notice                                                                     |

### Compatibility gates

workerd turns Node modules on by compatibility date (`enable_nodejs_fs_module` from 2025-09-15, and so on). `gates.ts` holds those dates. After a workerd bump, compare the definitions at the two tags:

```sh
curl -s -o old.capnp https://raw.githubusercontent.com/cloudflare/workerd/v<old>/src/workerd/io/compatibility-date.capnp
curl -s -o new.capnp https://raw.githubusercontent.com/cloudflare/workerd/v<new>/src/workerd/io/compatibility-date.capnp
diff old.capnp new.capnp | grep -i 'node\|impliedByAfterDate'
```

A new `enable_nodejs_*` flag or a changed date has to be reflected in `gates.ts`. If nothing changed, update only `flagsSource`.

### Tests that fail on purpose

After a bump, a few tests fail because the data moved. That is the signal to look, not to silence: check that each new expected value matches what the runtime does now. The sample apps (`test/core/sample-apps.test.ts` and `test/apps`) must keep passing. A failure there is a precision regression, not a test to update.

## Deno Deploy

`deno-deploy` reuses the Deno matrix and adds its own layer (`overrides/deno-deploy.json`, sourced from Deno's docs). Deploy often runs an older Deno than the newest release, so the report notes that APIs added since are reported as supported. Review that layer when Deploy's runtime version changes.

## Netlify Edge Functions

`netlify-edge` reuses the Deno matrix, so the Deno probes cover its runtime. Its own inputs are the Deno range of `@netlify/edge-bundler` and three sections of Netlify's documentation, and a weekly job (`netlify-edge` in `probe.yml`) compares both with what `data/overrides/netlify-edge.json` records. When it reports a change:

1. Read the changed page. If it now names a Deno version or blocks an API, add the entry to the override layer with the page as its source.
2. If the Deno range changed, set the `netlify-edge` version in `source.json` to the range's lowest version, and update `bundler` in the override file.
3. Update the hashes in the override file.

The `deno (netlify-min)` run of the probe looks up every API in the oldest Deno Netlify supports and lists where it differs from the data. The summary leaves out aliases (`x.default.y`, `sys` and the nested `path` names) and groups the rest by module, in three sections: present in the data but missing at runtime (possible false passes), missing as a named export only (`import stream from 'node:stream'` works, `import { promises }` fails), and unusable in the data (missing or a stub) but present at runtime. The full list, with every name as the probe wrote it, is folded away. It only informs the job summary. If Netlify starts documenting the version it runs, use that version in place of the minimum.

## Vercel Edge

`vercel-edge` is built from one documentation page, so keep it in step with the page. The weekly `vercel-edge` job parses the page and lists modules, Web APIs and disabled features that the data lacks or still has, and modules whose description changed. It also compares the globals of Vercel's emulator with the documentation. To act on it:

1. Read the page and update `data/allowlists/vercel-edge.json` and `data/overrides/vercel-edge.json`. Set the version in `source.json` to the page's `last_updated` date.
2. For a changed description, re-read it: the member lists for `async_hooks` and `util` come from those sentences. Then update the hash.
3. For members, the job reads `NativeModuleMap` from `next` (`dist/server/web/sandbox/context.js`) and from `@vercel/node` (`dist/dev-server.mjs`), compares both with `modules` in the allowlist, and reports members either side has that the data lacks or no longer has, and any disagreement between the two. Update the lists, and `members.sources` in the allowlist and the `next` and `@vercel/node` versions in `source.json`.
4. For Next.js, the job reads the list of Node.js modules its edge build keeps (`SUPPORTED_NATIVE_MODULES` in `dist/build/webpack/plugins/middleware-plugin.js`) and whether it still stubs out the others with `__import_unsupported`. If the stand-in is gone, importing a missing module may fail at load, and `lazyNodeImports` on the `vercel-edge` target needs to be reconsidered.
5. For a global the emulator has that the data does not keep, decide from the documentation whether Vercel provides it, and add it to `emulatorGlobals` if so.

A difference between the emulator and the documentation that is already understood goes in `knownDivergences` in `scripts/probe/vercel/emulator.mjs`, with the reason.

## After merging

1. The next Probe run should close the drift issue. If it still lists entries, they are real: handle them or mark them `validatesFirst` with a reason.
2. Cut a release when the data change is worth shipping: update `version` and the changelog, merge, and tag `vX.Y.Z`. The Release workflow publishes.

## Checklist

- [ ] Newest provider commit checked, dumps regenerated or vendored
- [ ] `source.json` versions, date, tags and note updated
- [ ] Every override `source` still resolves at the new tag
- [ ] Pinned probe on all three runtimes has no unexplained disagreements
- [ ] `gates.ts` compared with the new compatibility flags
- [ ] Tests, docs samples, the status page, the README and the changelog updated
- [ ] Limitations still true: reread [the limitations page](/guide/limitations) when the data's age or sources change
- [ ] `vp run ready` passes, and a few real projects were checked
