# Suggested fixes

A finding says what is wrong. A suggestion says what to do about it, and it appears in every report format: the `fix:` line in the text report, `suggestion` in the [JSON report](/reference/json#finding), the GitHub annotation and the pull request comment.

There are two kinds, and they come from different places.

| Kind                          | Where it comes from                                                    | Who changes it                           |
| ----------------------------- | ---------------------------------------------------------------------- | ---------------------------------------- |
| A setting (`kind: "setting"`) | The code. edgefit knows the flag or compatibility date that removes it | Change `src/targets/workerd/settings.ts` |
| A reviewed fix                | `data/suggestions.json`                                                | Anyone, with a source                    |

A setting always wins, because it is the smallest change. A finding in code that only runs when the API exists, and a warning that something cannot be checked, get no suggestion.

## The data file

`data/suggestions.json` maps a package, or an API, to a fix:

```json
{
  "version": 1,
  "packages": {
    "cross-spawn": [
      {
        "targets": ["workerd"],
        "kind": "change",
        "text": "cross-spawn starts child processes, which Workers cannot do. Do that work outside the Worker, at build time or in a service the Worker calls with fetch.",
        "apis": ["node:child_process.*"],
        "source": "https://github.com/cloudflare/workerd/blob/v1.20260929.1/src/node/child_process.ts",
        "reviewed": "2026-09-30"
      }
    ]
  },
  "apis": {
    "node:fs.watch*": [
      {
        "targets": ["workerd"],
        "kind": "change",
        "text": "…",
        "source": "…",
        "reviewed": "2026-09-30"
      }
    ]
  }
}
```

- `packages` is keyed by the name of the package the finding is in. `apis` is keyed by the API as reports show it, such as `node:fs.watch`. A trailing `*` matches a prefix.
- The entry for the package wins over the one for the API. `apis` inside a package entry limits it to those APIs. Among `apis` keys, an exact key wins over a prefix, and a longer prefix over a shorter one, whatever order the file lists them in.
- `targets` lists the targets the fix is true for: `workerd`, `bun`, `deno` or `deno-deploy`.
- `kind` is `replace` (use another package, named in `package`) or `change` (change the code or its configuration). `setting` is for the hints edgefit works out itself, and the data file does not accept it.
- `text` is one sentence that says what to do. It must be true without reading anything else.
- `source` is an `https` link to the code or documentation that supports the text. **An entry without a source is not accepted.** The file is checked when it loads and by a test.
- `reviewed` is the date someone last checked the source.

## Adding or correcting an entry

1. Find the evidence. For a runtime limit, read the runtime's source at the version in `data/source.json`, not at `main`. For a package, read its own README or code at the version you looked at.
2. Add the entry, or fix the one that is wrong. Keep the text to what the source shows.
3. Run `vp test`. The data test rejects a missing source, an unknown target or a bad date.
4. Add a test if the entry is for a new package or API: a sample app or fixture whose finding now carries the suggestion. `test/apps/real-packages.test.ts` shows how.
5. In the pull request, link the lines you read.

There is an [issue template](https://github.com/hamedniroomand/edgefit/issues/new?template=suggestion.yml) for proposing an entry without writing it.

## Replacing a package

A `replace` entry recommends code to depend on, so it has one more rule: edgefit must be able to check it. Add a fixture in `test/fixtures/suggestions/<replacement>` with an entry at `src/index.js` that imports the replacement. The data test runs `check` on it for each target the entry lists, and fails unless it reports nothing. If the replacement cannot be checked, use a `change` entry that describes what to do instead.

## Changing a setting hint

Setting hints live next to the check that produces them, in `src/targets/workerd/settings.ts`. Each one is a `suggestion` on the lookup result, with the setting's exact name and value in `setting`, so tools can read it. A hint is only right when the setting removes that finding. Test it in `test/targets/workerd.test.ts`.
