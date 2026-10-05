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
- **Variables that are set again.** A `let` or `var` that holds a check is followed only when its block does not set it again. A `var` in a nested block is checked only against the writes in that block, so a function in the block that runs after a write outside it is not seen.
- **Other ways to name a runtime.** Only `typeof Deno`, `typeof Bun`, `process.versions.deno`, `process.versions.bun` and `navigator.userAgent` compared with `Cloudflare-Workers`, `Bun` or `Deno` are read. A regular expression, a feature check that happens to tell runtimes apart, and a check on Node are not.
- **Checks that leave the runtime open.** `typeof Deno !== 'undefined' || typeof Bun !== 'undefined'` says the code runs on one of two runtimes, and edgefit does not follow that.
- **`try` blocks around an API that exists.** A `catch` stops the error of an API that is missing, so those are guarded. `fs.watch` on Workers exists and throws, or does nothing, and edgefit cannot tell whether the `catch` copes, so it stays a finding.

If you have confirmed a branch never runs on your runtime, [ignore](/guide/configuration#ignoring-findings) the finding with a reason.

## Reachability follows imported names

edgefit checks the code a project reaches, and traces which exports of each module are imported. A function that only an export nothing imports uses is left out, so a utility library that exports one `fs.watch` helper does not produce a finding when you only import its string helpers.

Everything in a module counts when it cannot be told which parts are used:

- the module runs code when it loads: top-level calls, assignments, and classes with static members, decorators or computed keys. What that code uses counts, and so does every function it names
- it is imported as a namespace (`import * as lib`), with `import()`, or with a `require()` whose result is used as a whole, or has its exports read as a whole (`export =`)
- it is CommonJS and its exports cannot be read by name. These are read: `exports.name = …` (also when the value is an object literal: its functions and methods count once the export is used, and any other value in it counts when the module loads; any other value that the module computes when it loads, such as `exports.name = obj.name` or `exports.name = call()`, counts when the module loads and gives an export with no part that waits), `exports.other = exports.name`, `exports.__defineGetter__('name', fn)`, `module.exports = { … }`, `module.exports = require('…')`, `module.exports = name` for a function or class that the module declares and nothing else names, `Object.defineProperty(exports, 'name', …)`, and the getter helpers that TypeScript and SWC emit (`_export(exports, { … })`, `_export_star`). A computed export name, `module.exports` set to something else, code that reads `exports` or `module` in any other way, or a mix of `module.exports =` and `exports.name =` writes counts as a whole
- it is build output. Build output has been through a bundler's own tree shaking, so [`--built`](/guide/built-output) checks it in full

What a CommonJS module asks of a module it `require`s is the members that are read from the result (`const dep = require('dep')` with `dep.name`, `const { name } = require('dep')`, `require('dep').name`). The result used in any other way asks for all of it. A `require` inside a function asks for its module only when that function is used, if one name stands for one module in the whole file. A name that is declared for two modules keeps its modules whole. A file that sets `module.exports` to a name that holds a Node.js module is that module in the files that `require` it, when every one of them binds the result to a name or destructures it: `const fs = require('./fs')` with `fs.readFile`, or `const { readFile } = require('./fs')`. Writes of a literal such as `null` to the name do not change this. The members that the importer reads are uses of the module there, with the guards of the importer. A file that passes the result on, loads it with `import()`, or is imported by an ES module keeps the module as `unknown`.

A `require` can be wrapped in a helper that compiled code adds. These helpers pass the module through:

- `_interop_require_default` and `_interop_require_wildcard`, as functions or as `@swc/helpers` members (`_interop_require_default._(require('dep'))`)
- `_export_star`, `__exportStar` and `__reExport`
- `__importDefault`, `__importStar` and `__exportStar`, as `tsc` defines them or as members of `tslib`

Any other wrapper asks for all of the module.

A variable that is declared without a value and set once to a `require()` result, such as `let c; c = require('node:crypto')`, is followed like a `const`. A declaration with a value that cannot be a module, such as `null`, an object or a conditional, is followed too, and so is an assignment of a literal, an object, an array or a template, as in the `catch` of `try { http2 = require('node:http2') } catch { http2 = { constants: {} } }`. A declaration with a name, a member, a call or an `import()` as its value counts as a second write. Another declaration of the name (a parameter, a function or a second `var`), any other write to it in the file, or an export of it stops this.

A file can export a Node.js module under a name, as in `import * as crypto from 'node:crypto'; export { crypto }`. A direct re-export is the same. `export { promises as fsp } from 'node:fs'` is `node:fs.promises` under `fsp`. `export * as fs from 'node:fs'` is `node:fs` under `fs`. A file of the graph that imports that name by name, as in `import { crypto } from './node.js'`, uses the module there, and its members are checked. The export is then not reported as `unknown`. It stays `unknown` when nothing imports the name, when a file imports the whole file (`import * as`, `export * from`), or when the entry may export it. A file that loads the file with `import()` or `require()` and destructures plain names, as in `const { crypto } = await import('./node.js')`, `({ crypto } = await import('./node.js'))` or `const { crypto } = require('./node.js')`, counts as an import of those names. An assignment reads the names the same way a declaration does, when it is a statement by itself. When its value is used, as in `const m = ({ crypto } = require('./node.js'))`, the load takes the whole file. This includes the form that `tsc` writes for `import()` in CommonJS. A CommonJS file exports a module with `exports.crypto = crypto`. A file that loads the file with `const node_1 = require('./node.js')` or `const node_1 = await import('./node.js')` and only reads members from `node_1`, as in `node_1.crypto.randomBytes(8)`, counts as an import of those names, and the module is that module in the reading file. A name that is not a Node.js module there records nothing. The file stays `unknown` when `node_1` is passed on, stored, written to, or read with a computed key, or when a helper wraps the call. Any other use of `import()` or `require()` takes the whole file. `import * as ns from './node.js'` is read the same way: only the members read from `ns` are asked of the file, and a `ns` that is passed on, stored, exported again or read with a computed key asks for all of it. A module that a second file re-exports is not followed.

A name counts as used when any used code mentions it. A property or a local variable of the same name also counts, which can only keep a finding, never hide one.

## Imports used only as types

In a TypeScript file, an import whose names are never used as values gives no finding. A bundler drops such an import, so `import { ServerResponse } from 'node:http'` that only appears in `as ServerResponse` uses no API. When some names of an import are used as values, edgefit reports only those names.

The bundler keeps these imports when the `tsconfig.json` sets `verbatimModuleSyntax`, `preserveValueImports`, or `importsNotUsedAsValues` to `preserve` or `error`. edgefit then reports them. It has these limits:

- It reads the nearest `tsconfig.json` of each file, up to the project root. A config above the root is not read. It follows `extends` when the value is a relative path or a list of relative paths. A package name in `extends` is not followed.
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

Netlify Edge Functions run Deno 2.3.1, which edgefit measured on Netlify, because Netlify does not document its version or the Node APIs it blocks. The `netlify-edge` target uses the Deno data with a layer from those measurements. An API added to Deno after 2.3.1 is reported as supported. A file write is reported even when the path is under `/tmp`, where Netlify allows it.

## Your runtime's own APIs are not checked

edgefit checks Node built-ins and standard Web APIs. It does not check runtime-specific APIs such as Workers bindings, `Bun.serve` or `Deno.readFile`, and it does not check that your bundle fits the runtime's size limits, memory or CPU time.

## Framework build output

Build output is tested with Nitro and Nuxt. edgefit also looks for the entry files of SvelteKit's and Astro's Cloudflare adapters and of OpenNext, but only the directory layout is covered by a test, not real adapter output, so treat their results as less proven. Nothing marks those layouts as build output, so pass `--built`.

A Vercel Build Output API layout (`.vercel/output`) is covered by a test on a real Next.js 16.3.8 app, built with the Vercel CLI in CI, and by hand-written layouts for the cases a real build does not make: Node.js functions, symlinked functions, a missing entrypoint and an unreadable config. Netlify's older layout (`.netlify/edge-functions/manifest.json`) is covered by a test on a real SvelteKit 2.70.3 app with `@sveltejs/adapter-netlify` 6.0.4 and `edge: true`, built in CI. The Frameworks API layout (`.netlify/v1/edge-functions`) is covered only by hand-written layouts, because no adapter in the sample writes it. Its `import_map.json` is not applied.

Mapping findings to packages needs sourcemaps. Without them, edgefit reads the `//#region` markers that recent Nitro (Rolldown) builds write, and names the package from them. A build without either, such as one from an older Nitro, is reported against the build files, and an `ignore` rule with `package` cannot match. See [Framework build output](/guide/built-output).

## Constant module names only

`import(name)` and `require(name)` are read when `name` is a `const` holding a plain string. A template literal or a `+` that joins plain strings and such constants is read as the string it spells, so ``require(`card${suffix}`)`` with `const suffix = 'inal'` is `require('cardinal')`. A computed key is read the same way: `obj[name]` is `obj.text`, and `const method = Methods[level]` of an object whose values are all plain strings is each of those strings, so `console[method]()` checks each one. A `let`, a parameter, or an object with another kind of value stays `unknown`. A function with no parameter that only returns `require('node:x')`, with or without a `try` whose `catch` returns nothing, is read as that module wherever it is called with no argument, such as `const m = load()`. It is not read when it is exported, passed on, or has a parameter or another statement. An object whose values are all functions that only return `require('node:x')`, such as `{ 'node:zlib': () => require('node:zlib') }`, is read when every use of it is a call of one of them. A call with a key that is a string is a load of that module. A call with any other key may load any of them, so each one counts, and the members read on the result are not followed. An object that is passed on, read without a call, or called with an argument or with a key it lacks is not read. A function that only runs `import(name)` for its one parameter is read too, when every use of it is a call with a literal, such as `load('pkg')`. It is not read when it is exported, passed on, or called with anything else. The names of `const [a, b] = await Promise.all([x, y])` are bound by position when the elements are modules that edgefit follows, such as these calls or `import('node:fs')`, so `a` stands for `x`. A spread or a hole in the list, a rest element, or an element that is not a module leaves the names after it unbound. A module that is passed to a function of the same file is read as the members that the function reads on that parameter, such as `print(process.stderr)` with `stream.write()` inside `print`. The same goes for a module in an object literal that is passed that way, read as `param.key.member` or `param[key].member`. It is not read when the function stores, returns or passes on the parameter, sets a member, reads one with a computed key that is not a string, or is declared in another file. A `let`, a join with a value that is not a plain string, a value computed from other values, a function result or an object property is reported as `unknown`. So is any other access edgefit cannot follow, such as `obj[key]`. A key that is a symbol, or a `const` that holds one, is not reported, because a symbol cannot name an API. `unknown` warnings never fail a check unless you make them errors.

## Static members of a parent class

A class that extends a Node.js class, or that is set up with `util.inherits`, counts as a use of that class and its instance members. The rest of the module is not reported as `unknown`. edgefit does not check a static member that you call through the subclass. Call it on the parent class, for example `EventEmitter.init()`, to have it checked.

## Deno: `jsr:` packages

`jsr:` imports of Deno workspace members are followed. Other `jsr:` imports are not read, because edgefit does not read the Deno cache or the `vendor` directory. They are reported as `unknown`, with the package name.

## Vercel Edge is documented, not measured

Vercel publishes no compatibility dump for its Edge runtime, so the `vercel-edge` target is built from its documentation. Anything the documentation does not list is reported as missing, and the target is experimental. Vercel also recommends its Node.js runtime for functions. See [Vercel Edge](/targets/vercel-edge).

## Platform limits are not checked

Beyond API compatibility, platforms limit bundle size, memory and CPU time per request (Netlify Edge Functions: 20 MB, 512 MB and 50 ms). edgefit checks none of them.
