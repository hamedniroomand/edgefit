<p align="center">
  <img src="https://raw.githubusercontent.com/hamedniroomand/edgefit/main/docs/public/icon.svg" width="72" alt="edgefit">
</p>

<h1 align="center">edgefit</h1>

<p align="center">
  Know your project runs on Cloudflare Workers, Bun, Deno, Netlify or Vercel Edge before you deploy.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/edgefit"><img src="https://img.shields.io/npm/v/edgefit?color=f06a2f&label=npm" alt="npm version"></a>
  <a href="https://github.com/hamedniroomand/edgefit/actions/workflows/ci.yml"><img src="https://github.com/hamedniroomand/edgefit/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/hamedniroomand/edgefit/blob/main/LICENSE"><img src="https://img.shields.io/github/license/hamedniroomand/edgefit?color=f06a2f" alt="MIT license"></a>
  <a href="https://edgefit.kitdev.space/"><img src="https://img.shields.io/badge/docs-edgefit-f06a2f" alt="Documentation"></a>
</p>

---

edgefit follows your code and every dependency from the entry point, finds the Node and Web APIs it reaches, and checks each one against pinned compatibility data for the runtime you deploy to. Every finding names the package, the file and the import chain behind it.

<p align="center">
  <img src="https://raw.githubusercontent.com/hamedniroomand/edgefit/main/docs/public/demo.gif" width="640" alt="edgefit check on a Worker project: five errors for file watching and process spawning APIs from chokidar and cross-spawn, each with the package, the file and line, the import chain and a link to the workerd source.">
</p>

- Resolves packages with the target's export conditions, so a library's Workers build is checked, not its Node build.
- Never claims safety: code it cannot analyze is reported as `unknown`.
- Checks `workerd`, `bun`, `deno`, `deno-deploy`, `netlify-edge` and the experimental `vercel-edge`, and framework build output.
- Reproducible: all data is vendored and pinned, and every result links to its source.
- Tested on real starters: Hono, Hono with zod, drizzle-orm, a Postgres client and a Nitro build, with pinned packages installed from npm.

## Quick start

```sh
npx edgefit check                                  # entry and settings from wrangler.jsonc
npx edgefit check --entry src/index.ts --target bun
npx edgefit compare --entry src/index.ts           # every runtime side by side
```

On pull requests, with the GitHub Action:

```yaml
- uses: hamedniroomand/edgefit@v0
  with:
    targets: workerd
```

## Package compatibility

`npx edgefit package <name>` checks a published package, and the [package table](https://edgefit.kitdev.space/packages/) lists popular ones. Add a badge to your README, linking to what it means:

```md
[![edgefit](https://edgefit.kitdev.space/packages/badges/<name>.svg)](https://edgefit.kitdev.space/packages/#<name>)
```

For a package that is not on the table, run `npx edgefit package . --badge badge.svg` and commit the result.

## Status

edgefit is a 0.x release and reads your code statically, so a clean run is not a guarantee: see the [limitations](https://edgefit.kitdev.space/guide/limitations). Its data is pinned to workerd 1.20260929.1, Bun 1.4.2 and Deno 2.9.7 and compared with the newest releases every week: see the [status page](https://edgefit.kitdev.space/guide/status).

## Documentation

Configuration, per-runtime behavior, the GitHub Action, JSON reports and the JavaScript API are at **[edgefit.kitdev.space](https://edgefit.kitdev.space/)**.

## Contributing

Bug reports, data corrections and pull requests are welcome. See [CONTRIBUTING.md](https://github.com/hamedniroomand/edgefit/blob/main/CONTRIBUTING.md), and [SECURITY.md](https://github.com/hamedniroomand/edgefit/blob/main/SECURITY.md) to report a vulnerability.

## License

[MIT](https://github.com/hamedniroomand/edgefit/blob/main/LICENSE) © Hamed Niroomand. The vendored compatibility data is © Cloudflare, Inc. (MIT) and runtime-compat-data (CC0-1.0); both licenses ship in [`data`](https://github.com/hamedniroomand/edgefit/tree/main/data).
