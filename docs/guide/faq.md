# FAQ

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

## How often is the compatibility data updated?

The data is pinned and only changes with an edgefit release, so upgrading edgefit is how you get newer data. A scheduled workflow probes the latest runtime releases and signals when the pinned data is due for an update. See [Compatibility data](/contributing/data).

## Can I use it from code instead of the CLI?

Yes, see the [JavaScript API](/reference/api).
