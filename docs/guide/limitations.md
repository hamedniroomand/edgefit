# Limitations

edgefit is a static analysis tool, and it is honest about what that means. This page lists what it does not do today, so you know where to look yourself. For what it does cover, and against which versions, see [Status](/guide/status).

## What a clean run means

`No known incompatible reachable APIs found` means none of the APIs edgefit could see are known to be a problem. It is not a guarantee that the project works. Everything below is a reason why.

## Only some guards are understood

A usage of an API the target lacks, in code that only runs when the API exists, is [guarded](/guide/findings#guarded-usages) and does not fail a check. That covers checks on the API itself (`if (x.y)`, `typeof x.y`, `'y' in x`, `x.y?.()` and guard clauses), a `try` block whose `catch` does not throw again, and code behind a check on the runtime, such as `typeof Deno !== 'undefined'` or `process.versions.bun`. A check does not protect an API that exists and throws, such as `fs.watch` on Workers. Only code that does not run on the target at all is guarded whatever it uses.

Other ways code decides what to do are not understood, and every branch is reported:

```js
import { isDeno } from './runtime.js';

if (isDeno()) {
  // Deno path
} else if (globalThis.navigator?.userAgent.match(/bun/i)) {
  // Bun path
} else {
  require('node:fs').watch(dir, onChange);
}
```

- **Helpers from another file.** A helper is followed only when it is in the same file, has no parameters and only returns the check. One that is imported, takes an argument or does more is not.
- **Other ways to name a runtime.** Only `typeof Deno`, `typeof Bun`, `process.versions.deno`, `process.versions.bun` and `navigator.userAgent` compared with `Cloudflare-Workers`, `Bun` or `Deno` are read. A regular expression, a feature check that happens to tell runtimes apart, and a check on Node are not.
- **Checks that leave the runtime open.** `typeof Deno !== 'undefined' || typeof Bun !== 'undefined'` says the code runs on one of two runtimes, and edgefit does not follow that.
- **`try` blocks around an API that exists.** A `catch` stops the error of an API that is missing, so those are guarded. `fs.watch` on Workers exists and throws, or does nothing, and edgefit cannot tell whether the `catch` copes, so it stays a finding.

If you have confirmed a branch never runs on your runtime, [ignore](/guide/configuration#ignoring-findings) the finding with a reason.

## Reachability follows imported names

edgefit checks the code a project reaches, and traces which exports of each module are imported. A function that only an export nothing imports uses is left out, so a utility library that exports one `fs.watch` helper does not produce a finding when you only import its string helpers.

Everything in a module counts when it cannot be told which parts are used:

- the module runs code when it loads: top-level calls, assignments, and classes with static members, decorators or computed keys. What that code uses counts, and so does every function it names
- it is imported as a namespace (`import * as lib`), with `import()`, or with a `require()` whose result is used as a whole, or has its exports read as a whole (`export =`)
- it is CommonJS and its exports cannot be read by name. These are read: `exports.name = …`, `module.exports = { … }`, `module.exports = require('…')`, `Object.defineProperty(exports, 'name', …)`, and the getter helpers that TypeScript and SWC emit (`_export(exports, { … })`, `_export_star`). A computed export name, `module.exports` set to something else, code that reads `exports` or `module` in any other way, or a mix of `module.exports =` and `exports.name =` writes counts as a whole
- it is build output. Build output has been through a bundler's own tree shaking, so [`--built`](/guide/built-output) checks it in full

What a CommonJS module asks of a module it `require`s is the members that are read from the result (`const dep = require('dep')` with `dep.name`, `const { name } = require('dep')`, `require('dep').name`, also through `_interop_require_default` and `_interop_require_wildcard`). The result used in any other way asks for all of it.

A name counts as used when any used code mentions it. A property or a local variable of the same name also counts, which can only keep a finding, never hide one.

## Imports used only as types

In a TypeScript file, an import whose names are never used as values gives no finding. A bundler drops such an import, so `import { ServerResponse } from 'node:http'` that only appears in `as ServerResponse` uses no API. When some names of an import are used as values, edgefit reports only those names.

The bundler keeps these imports when the `tsconfig.json` sets `verbatimModuleSyntax`, `preserveValueImports`, or `importsNotUsedAsValues` to `preserve` or `error`. edgefit then reports them. It has these limits:

- It reads the nearest `tsconfig.json` of each file, and follows `extends` when the value is a relative path or a list of relative paths. A package name in `extends` is not followed.
- It does not read the `tsconfig` option of a bundler.
- A name counts as used when it is read anywhere in the file. A local variable of the same name also counts, which can only keep a finding, never hide one.
- It reads no tsconfig for files in `node_modules`, so their imports that are used only as types are skipped.

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

Netlify Edge Functions run Deno, but Netlify does not document which version or which Node APIs it blocks. The `netlify-edge` target uses the Deno data, records the oldest Deno Netlify's bundler accepts as a floor, and has no curated layer. If Netlify runs an older Deno than the data, an API added since is reported as supported.

## Your runtime's own APIs are not checked

edgefit checks Node built-ins and standard Web APIs. It does not check runtime-specific APIs such as Workers bindings, `Bun.serve` or `Deno.readFile`, and it does not check that your bundle fits the runtime's size limits, memory or CPU time.

## Framework build output

Build output is tested with Nitro and Nuxt. edgefit also looks for the entry files of SvelteKit's and Astro's Cloudflare adapters and of OpenNext, but only the directory layout is covered by a test, not real adapter output, so treat their results as less proven. Nothing marks those layouts as build output, so pass `--built`.

A Vercel Build Output API layout (`.vercel/output`) is covered by a test on a real Next.js 16.3.8 app, built with the Vercel CLI in CI, and by hand-written layouts for the cases a real build does not make: Node.js functions, symlinked functions, a missing entrypoint and an unreadable config. Netlify's older layout (`.netlify/edge-functions/manifest.json`) is covered by a test on a real SvelteKit 2.70.3 app with `@sveltejs/adapter-netlify` 6.0.4 and `edge: true`, built in CI. The Frameworks API layout (`.netlify/v1/edge-functions`) is covered only by hand-written layouts, because no adapter in the sample writes it. Its `import_map.json` is not applied.

Mapping findings to packages needs sourcemaps. Without them, edgefit reads the `//#region` markers that recent Nitro (Rolldown) builds write, and names the package from them. A build without either, such as one from an older Nitro, is reported against the build files, and an `ignore` rule with `package` cannot match. See [Framework build output](/guide/built-output).

## Constant module names only

`import(name)` and `require(name)` are read when `name` is a `const` holding a plain string. A `let`, a value computed from other values, a function result or an object property is reported as `unknown`. So is any other access edgefit cannot follow, such as `obj[key]`, and `unknown` warnings never fail a check unless you make them errors.

## Deno: `jsr:` packages

`jsr:` imports of Deno workspace members are followed. Other `jsr:` imports are not read, because edgefit does not read the Deno cache or the `vendor` directory. They are reported as `unknown`, with the package name.

## Vercel Edge is documented, not measured

Vercel publishes no compatibility dump for its Edge runtime, so the `vercel-edge` target is built from its documentation. Anything the documentation does not list is reported as missing, `require` calls are not checked, and the target is experimental. Vercel also recommends its Node.js runtime for functions. See [Vercel Edge](/targets/vercel-edge).

## Platform limits are not checked

Beyond API compatibility, platforms limit bundle size, memory and CPU time per request (Netlify Edge Functions: 20 MB, 512 MB and 50 ms). edgefit checks none of them.
