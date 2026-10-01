# Comparing targets

`edgefit compare` answers a different question from `check`: not "what breaks on this runtime" but "which runtime fits this project best". It scans once per target and prints one table of the APIs your project reaches.

```sh
npx edgefit compare --entry src/index.ts
```

```
edgefit compare · entry src/index.ts

API            workerd  bun  deno
node:fs.watch  ✗        ✓    ✓

✓ supported  ~ mismatch or mocked  ✗ unsupported  ! missing per Web API data  ? unknown  – not reached or ignored

1 error, 0 warnings
```

## Choosing targets

By default every target is compared except `deno-deploy` and `netlify-edge`, whose columns would be the same as `deno`, and the experimental `vercel-edge`. Name the targets you want as arguments:

```sh
npx edgefit compare workerd bun
```

## Rows

Only APIs with a finding on at least one target are shown. Two flags add more:

- `--all` also lists the APIs every target supports, which gives you the full picture of what your project touches.
- `--verbose` lists the packages and findings behind each row.

## What `–` means

A dash means the target never reaches the API, or the finding was ignored or turned off in your config. The first case is real and common: a package can export a different file per runtime through export conditions, so one target may never load the code that uses the API.

## JSON and exit codes

`--format json` prints:

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

Like `check`, `compare` exits with `1` when any target has an error-level finding.
