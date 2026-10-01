# Vercel Edge

Target name: `vercel-edge`. **Experimental.**

```sh
npx edgefit check --target vercel-edge
```

::: warning Read this first
Vercel recommends the Node.js runtime for functions and calls standalone Edge Functions deprecated. [Routing Middleware](https://vercel.com/docs/routing-middleware) still runs on the edge runtime by default, and that is the main use this target is for.
:::

## What the data covers

Vercel's Edge runtime is its own V8 runtime, not workerd, Deno or Node, and Vercel publishes no compatibility dump for it. So this target is built from Vercel's [Edge Runtime documentation](https://vercel.com/docs/functions/runtimes/edge) as of 2026-08-03:

- **Node modules.** Only five are allowed, with or without the `node:` prefix: `events`, `buffer`, `assert`, `async_hooks` and `util`. The documentation says which modules; it does not say which members of each exist. Those come from two pieces of Vercel's own code that list them identically: `NativeModuleMap` in Next.js's edge sandbox (`next@16.3.8`) and in `@vercel/node`'s dev server (`17.0.0`). Every member they do not list is reported as missing, so `buffer.Blob`, `events.getEventListeners`, `assert.partialDeepStrictEqual`, `util.inspect` and `async_hooks.createHook` are errors, and `util.format`, `util.inherits` and `async_hooks.AsyncResource`, which the documentation does not mention, are not. Every other built-in, such as `fs`, `path` or `crypto`, is reported as missing.
- **Globals.** `Buffer`, `process.env` and the Web APIs the documentation lists. The ECMAScript builtins of V8 (`Uint16Array`, `WeakRef`, `globalThis` and the rest) are kept, and so are a few web globals the documentation's table omits but Vercel's own emulator provides (`queueMicrotask`, `performance`, `WebSocket` and others). Node-only globals such as `setImmediate` and `global` are reported as missing.
- **Disabled features.** `eval`, `WebAssembly.compile` and `Function(string)` are reported as unsupported. `Function(string)` is a call of the `Function` constructor with an argument, `new Function('a', 'return a')` for example. `Function('return this')`, the classic way to reach the global object, is not counted, since code that uses it checks for `globalThis` first.
- **Other Web APIs** come from the `edge-light` column of runtime-compat-data, as warnings at the `web` level.

Anything the documentation does not list is reported as missing, so if Vercel adds something before the data catches up you see a false error, not a false pass.

## Entry detection

If the project root, or `src/`, has a `middleware.ts` (or `.js`, `.mts`, `.mjs`), it is the entry. Otherwise pass `--entry`.

- A middleware that sets `export const config = { runtime: 'nodejs' }` (Next.js 15.5 and later) runs on Node.js, so it is not used as the entry and the report says why.
- `proxy.ts` is not picked up. Next.js 16 renamed middleware to proxy, and its own build rejects route segment config in a proxy file with "Proxy always runs on Node.js runtime", so the Edge runtime does not run it.
- Edge Functions that are not middleware (`export const runtime = 'edge'` in a route, or `config.runtime` in `api/`) are not found yet. Pass `--entry` for them.

## Export conditions

Packages are resolved for the browser with the `edge-light` condition, then `module`, `import` and `default`. `worker` is not used. This follows the Next.js resolver for Edge code. Edge Functions built outside Next.js may resolve `module` differently.

## Importing a Node.js module Vercel lacks

Importing `node:fs`, or any module outside the five, is not reported. Only reading from it is: a call, a property read or a construct, reported where it happens, so a runtime check around it applies. A named import (`import { readFileSync } from 'node:fs'`) counts where it is used, not on the import line.

This follows Next.js. Its edge build replaces a Node.js module it lacks with a stand-in (`globalThis.__import_unsupported`) that throws when something from it is used, so a library that imports `node:fs` at the top and only uses it on Node.js still loads. I read this in `next@16.3.8`, in the webpack build. I could not read Turbopack's build, and outside Next.js (a function bundled with esbuild, for example) an import of a module the runtime lacks may fail when the function loads. There the import is the failure, and this target will not report it.

The weekly check reads Next's own list of kept modules, which is the same five, and fails if the stand-in disappears.

## Runtime checks

Code behind one of these checks is treated as running on Vercel's Edge runtime only, and code behind the opposite check is not checked here:

- `typeof EdgeRuntime` compared with `'string'` (the form [Vercel documents](https://vercel.com/docs/functions/runtimes/edge#check-if-youre-running-on-the-edge-runtime)) or with `'undefined'`, with `===` or `!==`, and `globalThis.EdgeRuntime`.
- `process.env.NEXT_RUNTIME` compared with `'edge'` or `'nodejs'`. Next.js replaces it at build time, and Next itself and many libraries built for it branch on it.

## Next.js middleware

Next.js middleware is the main use of this target. A middleware that only imports `NextResponse` from `next/server` reports one finding today, and it does not run in the middleware: `process.cwd` in Next's server rendering code, which `next/server` reaches through a CommonJS barrel that edgefit checks in full.

Add an [`ignore` rule](/guide/configuration) for it if you need a clean report.

## What is not checked

- **`require`.** The documentation says calling `require` directly is not allowed and that packages must be ES modules. edgefit follows CommonJS today, so this is not reported.
- **`WebAssembly.instantiate` from bytes.** Only imported modules work on Vercel; edgefit cannot see where the bytes come from.
- **Vercel's limits** on bundle size and execution time.

Two limits of those member lists:

- Both files are local stand-ins for production (Next's own edge sandbox, and Vercel's dev server), so they are not a measurement of the platform. The documentation's "fully supported" for `events` is wider than the sandbox's member list, and the list wins here, which can only cause false errors.
- Turbopack's edge build also keeps `assert/strict` and `util/types` as separate modules, but neither sandbox lists them, so they are reported as missing. The production witness ([#8](https://github.com/hamedniroomand/edgefit-2/issues/8)) would settle it.

## How trustworthy this is

The results describe what Vercel's documentation says, not what was observed in production. The report notes this.

A weekly job checks the data two ways, and adds a section to the data drift issue when either finds something:

- It parses the documentation page and compares its modules, Web APIs, disabled features and a hash of each module's description with the data.
- It runs Vercel's emulator, `@edge-runtime/vm`, and compares it with the documentation. The emulator is a witness, not a source: it does not define `Buffer` or `process`, and it can compile WebAssembly from bytes, which Vercel disables. Those differences are known and listed, so only new ones are reported.

`edgefit compare` leaves `vercel-edge` out unless you name it.
