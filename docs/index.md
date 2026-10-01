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

<Terminal
  src="/demo.gif"
  title="npx edgefit check"
  alt="edgefit check on a Worker project: five errors for file watching and process spawning APIs from chokidar and cross-spawn, each with the package, the file and line, the import chain and a link to the workerd source."
/>

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

<Card title="Tested on real apps" icon="flask-conical" to="/guide/status#how-precision-is-kept">

Every release is checked against popular starters (Hono, zod, drizzle-orm, a
Postgres client, a Nitro build) installed from npm.

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

<Card title="Netlify Edge Functions" icon="network" to="/targets/netlify-edge">

`netlify-edge`. The Deno data, with the entry and import map read from `netlify.toml`.

</Card>

<Card title="Vercel Edge" icon="layers" to="/targets/vercel-edge">

`vercel-edge`, experimental. Built from Vercel's documented list of allowed modules.

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
