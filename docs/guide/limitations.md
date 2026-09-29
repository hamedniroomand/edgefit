# Limitations

edgefit is a static analysis tool, and it is honest about what that means. This page lists what it does not do today, so you know where to look yourself. For what it does cover, and against which versions, see [Status](/guide/status).

## What a clean run means

`No known incompatible reachable APIs found` means none of the APIs edgefit could see are known to be a problem. It is not a guarantee that the project works. Everything below is a reason why.

## Only some guards are understood

A usage of an API the target lacks, in code that only runs when the API exists, is [guarded](/guide/findings#guarded-usages) and does not fail a check. That covers checks on the API itself: `if (x.y)`, `typeof x.y`, `'y' in x`, `x.y?.()` and guard clauses. A check does not protect an API that exists and throws, such as `fs.watch` on Workers.

Other ways code decides what to do are not understood, and every branch is reported:

```js
if (typeof Deno !== 'undefined') {
  // Deno path
} else if (process.versions?.bun) {
  // Bun path
} else {
  require('node:fs').watch(dir, onChange);
}
```

Checks on which runtime this is (`typeof Deno`, `process.versions.bun`, `navigator.userAgent`), `try`/`catch` around a call, and checks hidden behind a helper function all still produce findings. If you have confirmed a branch never runs on your runtime, [ignore](/guide/configuration#ignoring-findings) the finding with a reason.

## Reachability is per module

When a module is reached, everything in it is checked, even exports you never import. A utility library that exports one function using `fs.watch` produces a finding even if you only use its string helpers.

## Existing is not the same as working

The Node compatibility matrix records whether an API exists on each runtime. Curated overrides cover the APIs that are known to exist and still throw or do nothing, and a weekly probe checks them against the real runtimes. Still, an API that exists and works only in part can pass, and an API that throws only with certain arguments can pass too. The overrides are read by hand from the runtimes' sources, so they can be wrong or out of date until the probe or a report finds it.

## The data has an age

- **The data is pinned.** It describes the runtime versions on the [Status](/guide/status) page. A newer release of a runtime can add APIs edgefit still reports as missing, until the next data update. A weekly check finds these, so the gap is usually days.
- **The runtime dumps come from a third party.** The matrix provider's repository had no data newer than April 2026, so the dumps for the newest releases were regenerated with its own scripts. If that project stops being maintained, updates depend on that regeneration.
- **The Web API data is from March 2024.** It only fills in what the matrix does not describe, and its results are warnings at the `web` level for that reason. A Web API added since may be reported missing. The matrix's own results win where it has measured the API.
- **The Node baseline merges Node 20, 22 and 24.** An API that any of them has is in the baseline, so a target that lacks it is reported even if your code targets an older Node.
- **Your version can be older than the data.** With a pinned Bun or Deno version older than the data, APIs added since are reported as supported. You are told in a note.

## Settings can be assumed

Without a wrangler config, edgefit uses the compatibility date and flags of its data (`nodejs_compat`) and says so in a note. Cloudflare Workers gates Node modules by date and flag, so a project with different settings can see different results. Set them in the [config](/guide/configuration#cloudflare-workers).

Deno Deploy runs an older Deno than the newest release. Its results are the Deno data plus a curated layer, and that layer is the least tested part of the data.

## Your runtime's own APIs are not checked

edgefit checks Node built-ins and standard Web APIs. It does not check runtime-specific APIs such as Workers bindings, `Bun.serve` or `Deno.readFile`, and it does not check that your bundle fits the runtime's size limits, memory or CPU time.

## One entry per run

edgefit scans from one entry point. A project with several entries, such as several Workers, needs a run for each, and the config's `entry` holds one file.

## Framework build output

Build output is tested with Nitro and Nuxt. edgefit also looks for the entry files of SvelteKit's and Astro's Cloudflare adapters and of OpenNext, but those layouts are not covered by tests, so treat their results as less proven.

Mapping findings to packages needs sourcemaps. Without them, edgefit reads the `//#region` markers that recent Nitro (Rolldown) builds write, and names the package from them. A build without either, such as one from an older Nitro, is reported against the build files, and an `ignore` rule with `package` cannot match. See [Framework build output](/guide/built-output).

## Constant module names only

`import(name)` and `require(name)` are read when `name` is a `const` holding a plain string. A `let`, a value computed from other values, a function result or an object property is reported as `unknown`. So is any other access edgefit cannot follow, such as `obj[key]`, and `unknown` warnings never fail a check unless you make them errors.

## Deno: `jsr:` packages

`jsr:` imports are not scanned yet and are reported as `unknown`.

## Planned targets

Netlify Edge Functions and Vercel Edge are not supported yet.
