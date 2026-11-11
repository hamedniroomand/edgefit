---
title: edgefit · Node.js compatibility checker for edge runtimes
titleTemplate: false
# Google uses WebSite data to name a subdomain site. Without it, results show "kitdev.space".
head:
  - - script
    - type: application/ld+json
    - '{"@context":"https://schema.org","@type":"WebSite","name":"edgefit","url":"https://edgefit.kitdev.space/"}'
description: 'A Node.js compatibility checker for Cloudflare Workers, Bun, Deno, Netlify and Vercel Edge. Check your code and every npm package it imports before you deploy.'
layout: home

# HomeHero shows `intro`. A `hero` key would also show the default hero.
intro:
  name: edgefit
  text: Know it runs on the edge before you deploy.
  tagline: >-
    A Node.js compatibility checker for Cloudflare Workers, Bun, Deno, Netlify and Vercel Edge.
    edgefit follows your code and every npm package from the entry point and
    tells you which Node and Web APIs the runtime will not run, down to the
    package, the line and the import chain.
  command: npx edgefit check
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

<Card title="Cloudflare Workers Node.js compatibility" icon="cloud" to="/targets/workerd" data-target="workerd">

`workerd`. Reads your wrangler compatibility date and flags.

</Card>

<Card title="Bun Node.js compatibility" icon="zap" to="/targets/bun" data-target="bun">

`bun`. Warns when your project pins an older Bun than the data.

</Card>

<Card title="Deno and Deno Deploy Node.js compatibility" icon="globe" to="/targets/deno" data-target="deno">

`deno` and `deno-deploy`. Applies your import map and `npm:` specifiers.

</Card>

<Card title="Netlify Edge Functions compatibility" icon="network" to="/targets/netlify-edge" data-target="netlify-edge">

`netlify-edge`. The Deno data, with the entry and import map read from `netlify.toml`.

</Card>

<Card title="Vercel Edge runtime compatibility" icon="layers" to="/targets/vercel-edge" data-target="vercel-edge">

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
