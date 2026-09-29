# Limitations

edgefit is a static analysis tool, and it is honest about what that means. This page lists what it does not do today, so you know where to look yourself.

## Only some guards are understood

A usage of an API the target lacks, in code that only runs when the API exists, is [guarded](/guide/findings#guarded-usages) and does not fail a check. That covers checks on the API itself: `if (x.y)`, `typeof x.y`, `'y' in x`, `x.y?.()` and guard clauses.

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

The Node compatibility matrix records whether an API exists on each runtime. Curated overrides cover the APIs that are known to exist and still throw or do nothing, and those overrides are checked against the real runtimes in CI. Still, an API that exists and works only in part can pass.

## Your runtime's own APIs are not checked

edgefit checks Node built-ins and standard Web APIs. It does not check runtime-specific APIs such as Workers bindings, `Bun.serve` or `Deno.readFile`, and it does not check that your bundle fits the runtime's size limits.

## Deno: `jsr:` packages

`jsr:` imports are not scanned yet and are reported as `unknown`.

## Planned targets

Netlify Edge Functions and Vercel Edge are not supported yet.
