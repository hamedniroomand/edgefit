---
layout: home

hero:
  name: edgefit
  text: Know it runs on the edge before you deploy.
  tagline: >-
    edgefit follows your code and every dependency from the entry point and
    tells you which Node and Web APIs Cloudflare Workers, Bun or Deno will not
    run, down to the package, the line and the import chain.
  image:
    src: /hero.svg
    alt: edgefit
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: What is edgefit?
      link: /guide/
    - theme: alt
      text: View on GitHub
      link: https://github.com/hamedniroomand/edgefit
---

```
$ npx edgefit check

error    unsupported  node:fs.watch  (workerd)
       file watching is not implemented; throws ERR_UNSUPPORTED_OPERATION
       chokidar@4.0.1  node_modules/chokidar/index.js:5:13
       via src/index.ts > src/dev/reload.ts > chokidar
       see https://github.com/cloudflare/workerd/tree/v1.20260929.1/src/node/internal/internal_fs_callback.ts
```

## Why edgefit

<CardGroup :cols="3">

<Card title="Follows the real graph" icon="network">

Packages are resolved with the same export conditions the target's bundler
uses, so a library's Workers build is checked, not its Node build.

</Card>

<Card title="Every finding is traceable" icon="search">

You get the API, the package and version, the file and line, the import chain
from your entry, and a link to the runtime source the result was read from.

</Card>

<Card title="Never claims safety" icon="shield-check">

Code edgefit cannot see, such as a computed `require`, is reported as
`unknown` instead of passing silently.

</Card>

<Card title="Pinned data" icon="database">

Compatibility data is vendored and versioned. Results only change when your
project or the data changes, never between two runs.

</Card>

<Card title="Works with frameworks" icon="layers">

Scan the build output of Nuxt, Nitro, SvelteKit or Astro. Sourcemaps map every
finding back to the original file.

</Card>

<Card title="Fits pull requests" icon="git-pull-request">

The GitHub Action reports only what a pull request adds or fixes, so accepted
findings do not drown out new ones.

</Card>

</CardGroup>

## Supported runtimes

<CardGroup :cols="3">

<Card title="Cloudflare Workers" icon="cloud" to="/targets/workerd">

`workerd`. Reads your wrangler compatibility date and flags.

</Card>

<Card title="Bun" icon="zap" to="/targets/bun">

`bun`. Warns when your project pins an older Bun than the data.

</Card>

<Card title="Deno and Deno Deploy" icon="globe" to="/targets/deno">

`deno` and `deno-deploy`. Applies your import map and `npm:` specifiers.

</Card>

</CardGroup>

## Where to go next

<CardGroup :cols="2">

<Card title="Getting started" icon="rocket" to="/guide/getting-started">

Install edgefit, run your first check and read the report.

</Card>

<Card title="Pull request checks" icon="git-pull-request" to="/guide/ci">

Add the GitHub Action and catch regressions in review.

</Card>

<Card title="CLI reference" icon="terminal" to="/reference/cli">

Every command, flag and exit code.

</Card>

<Card title="Contributing" icon="folder-git-2" to="/contributing/">

Set up the repository and learn how the compatibility data is kept honest.

</Card>

</CardGroup>
