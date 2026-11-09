---
description: 'edgefit FAQ: Node.js errors on Cloudflare Workers and Vercel Edge, npm errors, Nitro and Nuxt builds, why wrangler builds but edgefit reports errors.'
---

# FAQ

## `No such module "node:fs"` or `Could not resolve "fs"` on Cloudflare Workers

Workers has no Node built-in modules when the `nodejs_compat` flag is off. From compatibility date 2026-08-04, the flag is on by default. edgefit reads `compatibility_date` and `compatibility_flags` from your wrangler config. When the flag is off, edgefit reports each use of a Node module with the fix `Add nodejs_compat to compatibility_flags`. The `via` line shows the package that imports the module.

```sh
npx edgefit check --target workerd
```

## `[unenv] fs.readFile is not implemented yet!`

wrangler builds the Worker, but it puts an [unenv](https://github.com/unjs/unenv) polyfill in place of each Node module that is not native at your compatibility date. Some polyfill functions throw this error when you call them. edgefit reports a use of such a module as `mocked`, with the package and the import chain. A later compatibility date often makes the module native. See [Compatibility date and flags](/targets/workerd#compatibility-date-and-flags).

## `The edge runtime does not support Node.js 'crypto' module`

Next.js shows this error when middleware or an Edge route uses a Node module that the Vercel Edge runtime does not have. The runtime allows only `events`, `buffer`, `assert`, `async_hooks` and `util`. The use often comes from a dependency, not from your code. edgefit finds the package and the import chain:

```sh
npx edgefit check --target vercel-edge
```

See [Vercel Edge runtime compatibility](/targets/vercel-edge).

## `npx edgefit` fails with EBADDEVENGINES

Your project's `package.json` sets `devEngines.packageManager` to a package manager other than npm, and npm refuses to run anything inside it. Use the one the project declares instead:

```sh
pnpm dlx edgefit check
bunx edgefit check
yarn dlx edgefit check
```

## Findings say "your code" for a Nitro or Nuxt build

The report cannot tell which package a finding belongs to without a sourcemap. Build with `sourcemap: true` (Nitro also needs `experimental.sourcemapMinify: false`) and rerun. Recent Nitro builds also mark each module in a chunk, and edgefit reads those markers to name the package even without sourcemaps, though the location then points into the build. See [Framework build output](/guide/built-output).

## Why is a package I never imported in my report?

Look at the `via` line. It is the import chain from your entry to that package. A dependency of a dependency is still code you ship.

## wrangler builds my project fine. Why does edgefit report errors?

wrangler replaces Node modules that are not native at your compatibility date with polyfills, and some Node functions exist on Workers but throw when called. Both build without complaint. edgefit reports what happens when the code runs.

## A newer compatibility date fixes it. Does edgefit know?

Yes. The compatibility date and flags are read from your wrangler config and decide which Node modules are native. Bump the date in wrangler and run the check again.

## A finding is wrong. What do I do?

First check the `see` link, which points to the runtime source the result was read from. If the runtime really does support the API at the version shown in `edgefit targets`, please [open an issue](https://github.com/hamedniroomand/edgefit/issues/new/choose) with the API and the target. In the meantime, ignore it in your config.

## Why is the same API an error on one target and fine on another?

Different runtimes support different things, and packages often ship a different file per runtime through export conditions. [`edgefit compare`](/guide/compare) shows this side by side.

## Does edgefit send my code anywhere?

No. Everything runs locally, and the compatibility data ships inside the package.

## How is this different from running my tests on the runtime?

Tests run the code paths you exercise, and they need a good runtime setup. edgefit reads all the code you ship, including dependencies and branches no test reaches, and it needs no setup, so it finds a problem three packages down before a request does. It cannot see behavior that depends on values at runtime, and a passing check is not a passing test. Use both: edgefit in CI to catch what the graph reaches, tests for what your code does. See [Limitations](/guide/limitations).

## Isn't `wrangler deploy --dry-run` enough?

A dry run and a build check that the bundle compiles. wrangler replaces Node modules that are not native at your compatibility date with polyfills, so a build can succeed for code that throws or does nothing when called. edgefit reports that case, as `mocked`.

## Which runtime versions does it check against?

The versions on the [Status](/guide/status) page, and `edgefit targets` prints them for the version you installed. The data is compared with the newest releases every week.

## How often is the compatibility data updated?

The data is pinned and only changes with an edgefit release, so upgrading edgefit is how you get newer data. A scheduled workflow probes the latest runtime releases and signals when the pinned data is due for an update. See [Compatibility data](/contributing/data).

## Can I use it from code instead of the CLI?

Yes, see the [JavaScript API](/reference/api).
