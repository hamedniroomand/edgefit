---
description: 'How to read an edgefit finding: the API, the package, the file, the import chain, the category, the suggested fix, guarded usages and clean runs.'
---

# Reading findings

A finding is one API, used in one package, that the target does not fully support.

## Anatomy of a finding

```
error    unsupported  node:fs.watch  (workerd)
       file watching is not implemented; throws ERR_UNSUPPORTED_OPERATION
       chokidar@4.0.1  node_modules/chokidar/index.js:5:13
       via src/index.ts > src/dev/reload.ts > chokidar
       see https://github.com/cloudflare/workerd/tree/v1.20260929.1/src/node/internal/internal_fs_callback.ts
```

| Line                              | What it tells you                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| `error unsupported node:fs.watch` | Level, category and the API                                                                         |
| second line                       | What goes wrong on this target                                                                      |
| `chokidar@4.0.1 …:5:13`           | The package that owns the code, and the first place it uses the API. `your code` for your own files |
| `via …`                           | The import chain from your entry point                                                              |
| `see …`                           | The runtime source the result was read from, for curated entries                                    |

When a package uses the same API in several places, the report shows the first one and adds `(+3 more)`. The JSON report lists them all under `otherLocations`.

## Categories

| Category      | Meaning                                                                    | Default level |
| ------------- | -------------------------------------------------------------------------- | ------------- |
| `unsupported` | The API does not exist on the target, or exists but throws when called     | error         |
| `mocked`      | The API is a stub that may do nothing, or a polyfill injected by the build | error         |
| `mismatch`    | The API exists, but its shape differs from Node, or some options throw     | warning       |
| `web`         | A Web API is missing on the target according to runtime-compat-data        | warning       |
| `unknown`     | Static analysis could not tell                                             | warning       |

The Node data can lack a member, such as `navigator.locks.zzz`. When the Web API data does not list the member or an API above it, the member gets the result of the closest API above it that the Node data lists. This happens when the target lacks that API, or has it with another type. The detail line then starts with `is below an API that`, for example `is below an API that does not exist on the target`. A member below the point where the Node data stops also gets the result of the API above it. There, the Node data wins over the Web API data. When the target has that API, the Node data gives no finding for the member, but a curated entry or the Web API data can still give one.

### unsupported

The clearest case. Either the module or member is not there, or it is there and throws, for example `ERR_METHOD_NOT_IMPLEMENTED`. Code that reaches it will fail.

A reachable native addon (a `.node` file) is also `unsupported` on Workers, Vercel Edge, Netlify Edge and Deno Deploy. The finding shows the import chain to the addon. edgefit does not look inside the addon. Bun and Deno load native addons, so they give no finding. To ignore one, use an `ignore` rule with its `api`, which is `native addon <file>.node`.

A package that loads its addon through a loader (`node-gyp-build`, `bindings`, `node-pre-gyp`, or a platform package that ships a `.node` file) gets the same finding, with the api `native addon <package>`. edgefit reads the manifest of each package to find these: `gypfile`, `binary`, an install script that runs `node-gyp`, `prebuild-install`, `node-pre-gyp`, `node-gyp-build` or `cargo-cp-artifact`, or a dependency on a known loader. The computed `require` in such a loader is not reported as `unknown`.

### mocked

The API exists and does not throw, but it does not do its job. On Workers, `dgram` sockets accept calls and never send anything. On Bun, `async_hooks.createHook` returns a hook that is never called. These are errors by default because they fail silently, which is worse than failing loudly.

On workerd, a Node module that is not native at your compatibility date is also reported as `mocked`, because wrangler replaces it with an [unenv](https://github.com/unjs/unenv) polyfill. In [built output mode](/guide/built-output), polyfills the build bundled are reported the same way.

### mismatch

The API exists but differs from Node: a missing property, a different arity, a different type, or an option that throws. It may be fine for your use. Check the detail line.

Some APIs fail only for some options. When the data names those options, a call is a finding only when it passes one of them in an object literal, or in a local variable that holds an object literal and is not set again. edgefit reads the last argument that is an object, and counts a key only when its value is always defined. When code changes that object after it is made, as in `options.key = value`, `delete options.key` or `Object.assign(options, more)`, edgefit reads no keys of it. A call of a name imported with `import { name }` gets the finding at the call. See [Options that are not known](/guide/limitations#options-that-are-not-known) for the calls that edgefit cannot read.

### web

A Web API global or member, such as `FileReader` or `navigator.gpu`, is missing according to [runtime-compat-data](https://www.npmjs.com/package/runtime-compat-data). That data is generated automatically and is not always accurate, so it gets its own category at warning level. Where the Node compatibility matrix has measured the API directly, the matrix wins and the finding is `unsupported` instead.

A feature check such as `if ('gpu' in navigator)` is not reported for `navigator.gpu`. It is a use of `navigator`, so a target that lacks `navigator`, such as `vercel-edge`, reports `navigator` as `unsupported`.

### unknown

edgefit could not determine what is used. Typical causes:

- `require(name)` or `import(name)` with a computed module name
- computed member access on a module that has unsupported members, such as `fs[method]`
- a module the compatibility data does not cover
- a `jsr:` import on Deno
- an import of an optional peer dependency that is not installed. Edgefit does not install peers, so what the peer provides is not checked
- a `require('module')` inside a function when the module is not installed. The finding names the module and the call location. A top-level load of a missing module still stops the check

A `require()` or `import()` of a name that the user of the code gives, such as a parameter, is not an `unknown` finding. It is a note, because the code does not choose the module. See [packages](/guide/packages#modules-that-the-user-names). An `unknown` finding is only reported when the access could reach something unsupported. Computed access on a module that is fully supported on the target is not reported. An API that fails only for some options does not count, see [Options that are not known](/guide/limitations#options-that-are-not-known). An API that the generated data lists as missing or as a different type does not count either when the curated data marks it as supported.

Symbol keys such as `x[Symbol.iterator]` are never reported, since a symbol cannot name an API. The global object on its own (`globalThis`, `self`) is not reported either, and neither is `globalThis['crypto']`, which is read like `globalThis.crypto`. A computed write to the global object, as in `globalThis[key] = value`, is not reported, because it does not read an API. A computed read with a fallback, as in `globalThis[key] || Fallback` or `globalThis[key] ?? Fallback`, is not reported either, because the code works when the global is missing. The same holds when the read is the value of `x = globalThis[key]` or `let x = globalThis[key]` and the next statement is `if (typeof x !== 'function') x = Fallback;`, `if (!x) x = Fallback;` or `if (x == null) x = Fallback;`.

A key that is a parameter of a function of the file is each string that the calls pass, when the function is only called by name, every call passes the argument, and edgefit knows each argument. An argument can be a string, a name that holds known strings, or a member of each object of a known list, as in `map[i].name`. A function that is exported, passed on, or called with an unknown value keeps the key as `unknown`.

A key from a loop over a list is a key that the object has, when the list is a `const` made by `.filter` with a test `name in obj`, as in `Object.entries(x).filter(([name]) => name in obj)`, and the loop reads `obj[name]` on the same binding of `obj`. The read cannot use an API that the target lacks, so it is not reported as `unknown`. A negated test, a test of another object, a loop that writes the name, and a `let` list keep the key as `unknown`.

A key that is an imported name is the string that the imported file exports as a `const`: `export const key = 'text'`, a join of such strings, or `export { key }`. A re-export of the name (`export { key } from`, or an import that is exported again) is followed. `export let`, `export * from` and a string that the file builds from its own imports keep the key as `unknown`.

By default the `unknown` warnings are folded into one line per package, because there are often many and they rarely need action:

```
warning  unknown  jose@6.2.12  1 access that cannot be checked: globalThis[<expression>] (1)
       Run with --verbose for the locations.
```

`--verbose` lists each one with its location and chain. The JSON report always has every finding, and the summary still counts them as warnings. An `unknown` you turned into an error with `levels` is listed in full.

## Suggested fixes

When edgefit knows what to do about a finding, it says so under it:

```
error    unsupported  node:child_process.spawn  (workerd)
       every child_process function throws ERR_METHOD_NOT_IMPLEMENTED; Workers cannot spawn processes
       cross-spawn@7.0.6  node_modules/cross-spawn/index.js:12:24
       fix: cross-spawn starts child processes, which Workers cannot do. Do that work outside the Worker, at build time or in a service the Worker calls with fetch.
            https://github.com/cloudflare/workerd/blob/v1.20260929.1/src/node/child_process.ts
```

Two kinds of fix exist:

- **A setting.** When a config change makes the finding go away, the fix gives the exact value: `Add nodejs_compat to compatibility_flags`, or `Set compatibility_date to 2025-09-15 or later, or add the enable_nodejs_fs_module flag`. The JSON report has it as `setting`, with a `name` and a `value`.
- **A reviewed fix.** A curated list maps packages and APIs to what to do, each with a link to the evidence. Anyone can [add or correct an entry](/contributing/suggestions).

A finding has at most one fix, and a setting wins over a reviewed fix. Most findings have none, since edgefit only suggests what it can source. Guarded usages and `unknown` warnings never do.

## Guarded usages

Code often checks for an API before it uses it:

```js
if (typeof subtle.getPublicKey != 'function') {
  throw new TypeError('the key must be extractable');
}
await subtle.getPublicKey(key, []);
```

When the target does not have the API, or the data does not cover it, a usage that only runs after such a check is a guarded finding. An API that the data does not cover is then not an `unknown` warning. It is left out of the list and does not fail a check. The report counts them (`1 guarded usage hidden`), and `--verbose` lists them. In JSON they are under `guarded`, next to `findings`.

A use of an API that the data does not cover, outside a check, such as `const s = v8.startupSnapshot`, is still an `unknown` warning, also when the code uses a member of it after a check. A use of the module itself, such as its import, is the exception: when the code uses the module's members only after a check, edgefit does not report the module. It is not a guarded finding either, so the report does not count it.

A check does not protect an API that exists and throws or does nothing, such as `fs.watch` on Workers, because the check passes and the call still fails. Those stay findings, and so do `mocked` and `mismatch` results. Code that does not run at all on the target is the exception, see [Runtime checks](#runtime-checks).

### Checks for an API

These checks are understood:

- `if (x.y)`, `typeof x.y === 'function'`, `x.y !== undefined` and `'y' in x`, for the code they protect
- `x.y && x.y()`, `!x.y || x.y()` and `x.y ? x.y() : fallback`
- `x.y` in any place of an `&&` or `||` chain that is the test of an `if`, a loop or `?:`, or the operand of `!`, such as `if (a && x.y && b)`
- `x.y?.()`, and `if (x.y?.z)` or `if (x.y?.z?.())`, which also protect `x.y`
- a guard clause such as `if (!x.y) throw …` or `return`, for the rest of the block

A minifier writes `typeof x.y === 'undefined'` as `typeof x.y > "u"`. It writes `typeof x.y !== 'undefined'` as `typeof x.y < "u"`. edgefit reads both as the long form. It reads them with the sides swapped too: `"u" < typeof x.y` means `=== 'undefined'`, and `"u" > typeof x.y` means `!== 'undefined'`.

`'y' in x` throws when `x` is missing, so it is a use of `x`. It is still a check for `x.y`. edgefit does not report the global object itself (`globalThis`, `self` or `global`), so `'X' in globalThis` is only a check.

A read that is an operand of `||` or `??` is a check too, as in `const f = util.getCallSites ?? util.getCallSite`. A member that the target lacks gives no finding, because it gives `undefined` and the operator moves on. A member that exists and throws is still a finding, because the value goes on. The right operand counts when the left one is an API too. A value that is called in place, such as `(x.y || z)()`, is a use.

A read with `?.`, such as `x?.y`, gives `undefined` when `x` is missing, so it is a check. These uses are the exception. They throw a TypeError for `undefined`, so they are uses, the same as without `?.`:

- `new (x?.y)()` and `class extends (x?.y)`
- a tag, as in ``(x?.y)`text` ``
- the right side of `instanceof` or `in`
- destructuring, as in `const { a } = x?.y`, and a default that is destructured, as in `{ a } = x?.y`
- a spread into an array or into the arguments of a call, `new` or `super`
- `for (const v of x?.y)` and `yield* x?.y`

A call, as in `x?.y()`, is also a use: it throws when `x` exists but has no `y`.

A compiler can write `x.y?.z` and `x.y ?? z` in another form when the code is compiled for ES2019 or older. edgefit reads that output as the source, so it is the same check. TypeScript, Babel and esbuild write `(_a = x.y) == null ? void 0 : _a.z`, `(_a = x.y) === null || _a === void 0 ? void 0 : _a.z`, `(_a = x.y) != null ? _a : z` and `(_a = x.y) !== null && _a !== void 0 ? _a : z`. A minified test is `(_a = x.y) != null && _a.z`. A call `x.y?.()` is `_a.call(x)`, and `(x.y?.z)()` is `(…).call(_a)`. A strict compare alone, as in `(_a = x.y) === null ? void 0 : _a.z`, is not one of them, because it lets `undefined` through. A chain on a plain name has no temp, as in `x == null ? void 0 : x.y`. Its compare is a check like any other, with one exception. The exception is a statement that is only a read of a member of the chain, or a direct call of the chain, as in `(x == null ? void 0 : x.y).z;` or `(x == null ? void 0 : x.y)();`. More reads and direct calls can follow, as in `(x == null ? void 0 : x.y).z.w();`. Such a statement throws when `x` is missing. So edgefit reads it as `(x?.y).z;`, and the read is a use. A statement that is a list of such reads joined with commas, as minified code writes it, counts too. The chain must be one or more reads of `x` with fixed names, such as `x.y`, `x.y.z` or `x['y']`. Each compiled form of the compare counts, such as `x == null ? void 0 : …`, `x === null || x === void 0 ? void 0 : …` or `x != null ? … : void 0`. These keep the compare as a check:

- a read in a declaration, a `return`, an argument, a test or a longer expression
- a read with `?.` or with a key that is not a fixed name, as in `(x == null ? void 0 : x.y)?.z` or `(x == null ? void 0 : x.y)[k]`
- a call through `.call`, `.apply` or `.bind`, a `new`, and destructuring
- a chain with a call inside, as in `(x == null ? void 0 : x.y()).z;`
- the form `x != null && x.y`, which code also has when nobody compiled it

A check only covers the API it names, and anything below it. `if (fs.watchFile)` does not guard `fs.watch`.

### Try blocks

Using an API the target lacks throws, and a `try` block whose `catch` does not throw again stops that:

```js
try {
  const { DatabaseSync } = require('node:sqlite');
  return new DatabaseSync(path);
} catch {
  return openFallback(path);
}
```

Usages in the `try` block are guarded, for the APIs the target lacks and for the APIs that exist and throw, because the `catch` takes the error of both. A check does not do the second. A promise that nothing awaits is not guarded, because a rejection does not reach the `catch`. The data does not say which API gives a promise, so edgefit reads the name: a path with `promises` in it. These are not guarded:

- a `try` with no `catch`, or a `catch` that throws again, even only on some errors. A `catch` that throws again only when `error.code` is not the code of a missing module guards the load of that module. On a target that lacks the whole module, it also guards the members of the module that the rest of the block reads, because the load throws before they run. On a target that has the module, a missing member stays a finding, because its error is not the one that the `catch` stops. Node.js gives `ERR_UNKNOWN_BUILTIN_MODULE` for a name with the `node:` prefix. Without the prefix, it gives `MODULE_NOT_FOUND` for `require()` and `ERR_MODULE_NOT_FOUND` for `import()`. Another API in the same block stays unguarded
- the `catch` and `finally` blocks themselves
- a function defined in the block, which may run after the block has ended, and a class body
- an `import()` that nothing awaits, since its error does not reach the block. `await import(…)` does

### Polyfills

Code can set a global only when the global is missing, as in `globalThis.x ??= value`. This is a polyfill store. The value does not run on a target that has the global and whose data marks it as supported, so the value is guarded on that target:

```js
import crypto from 'node:crypto';
import fs from 'node:fs';

globalThis.crypto ??= crypto; // Guarded on Workers, which have `crypto`
globalThis.fetch ??= () => fs.watch('.'); // Guarded on Workers, which have `fetch`
```

The guard applies to:

- a module that the store keeps
- each API and native addon in the value
- the code of a local function that only the store names, see [Functions that only checked code uses](#functions-that-only-checked-code-uses)

The forms are `??=`, `||=`, and an assignment after a check such as `if (!globalThis.crypto)`. The global object must be `globalThis`, `self` or `global` by its own name, or a `const` declared as `const g = globalThis` (or `self` or `global`). A store through a `let` or `var` alias, such as `let g = globalThis; g.fetch ??= value`, does not count.

The value stays a finding when:

- the target lacks the global, or its data marks the global as mocked or not supported, because the store runs
- the store has no check, such as `globalThis.fetch = fs.watch('.')`, or it uses `&&=`
- the global is `undefined` or `NaN`. `undefined` is nullish and has the type `undefined`, so each value test sees it as missing. `NaN` is falsy, so `||=` and `if (!globalThis.NaN)` see it as missing. `globalThis.NaN ??= value` stays guarded, because `NaN` is not `null` or `undefined`

### Runtime checks

Code that only runs on another runtime is never reached on this one, so everything it uses is guarded, an API that exists and throws included:

```js
if (typeof Deno !== 'undefined') {
  // Guarded on Workers and Bun
} else if (process.versions?.bun) {
  // Guarded on Workers and Deno
} else {
  // Not guarded on Workers
}
```

These checks name a runtime:

- `typeof Deno`, `typeof Bun`, `'Deno' in globalThis` and `globalThis.Deno`
- `typeof EdgeRuntime` (Vercel Edge) and `typeof Netlify` (Netlify Edge Functions), against `'undefined'` or the marker's own type (`'string'` for `EdgeRuntime`, `'object'` for `Deno`, `Bun` and `Netlify`)
- `process.env.NEXT_RUNTIME === 'edge'` or `'nodejs'`, which Next.js replaces at build time
- `process.versions.deno` and `process.versions.bun`
- `navigator.userAgent === 'Cloudflare-Workers'`, and `navigator.userAgent.startsWith('Bun')` or `.includes('Deno')`

The minified form of a `typeof` check, such as `typeof Deno < "u"`, names a runtime too. See [Checks for an API](#checks-for-an-api).

The `else` branch of such a check runs on every other runtime, and a guard clause such as `if (typeof Deno === 'undefined') return` covers the rest of the block. Deno Deploy counts as Deno, and Netlify Edge Functions count as both Deno and Netlify. A check that leaves the runtime open, such as `typeof Deno !== 'undefined' || typeof Bun !== 'undefined'`, protects nothing, and neither does a check on Node (`process.versions.node`), which Bun and Deno answer too.

### Checks for a global

A check for a global decides which branch runs when the target data says if the target has the global. The code that does not run is guarded, and it is not a finding:

```js
if (!globalThis.FileList) throw new Error('not supported'); // Throws on Workers, which lack `FileList`
const reader = new FileReader(); // Guarded on Workers
```

```js
if (!global.crypto) {
  require('crypto'); // Guarded on every target that has `crypto`
}
```

The forms are `typeof X`, a test of `X`, `'X' in globalThis` and `globalThis.X`, in an `if`, `?:`, `&&`, `||`, `??`, an `else` branch and a guard clause. The minified form of a `typeof` check counts too, see [Checks for an API](#checks-for-an-api). A global that the data does not name decides nothing. On a target where the code can run, it stays a finding.

`undefined` and `NaN` exist on every target, but a value test can see them as missing. `undefined` looks missing to each value test, also to `=== undefined` and `typeof … === 'undefined'`. `NaN` looks missing only to a truthiness test, such as `!globalThis.NaN` or `globalThis.NaN || x`. So the code that such a test runs is not guarded, see [Polyfills](#polyfills). `typeof globalThis.NaN`, `globalThis.NaN === undefined` and `globalThis.NaN ?? x` still decide the branch.

The data of `workerd` says that `window`, `document`, `HTMLAnchorElement`, `Deno` and `Bun` are missing. The data of `netlify-edge` says that `document`, `HTMLAnchorElement` and `Bun` are missing. So code behind `typeof window !== 'undefined'` is guarded on Workers. Netlify Edge Functions have a `window` global, so there the check decides nothing.

A global that the target lacks is `undefined` on the global object. So these uses of `globalThis.X`, `self.X` or `global.X` do not fail, and they are guarded on a target that lacks `X`:

- the checks in [Checks for an API](#checks-for-an-api), such as a test in an `if`, `?:`, `!`, `&&`, `||` or `??`, and an optional member (`globalThis.X?.y`), except in the uses that [Checks for an API](#checks-for-an-api) lists. The right side of `in`, as in `'k' in globalThis.X`, is a use.
- the test of a `while`, `do` or `for` loop
- `Boolean(globalThis.X)`
- a comparison with `===`, `!==`, `==` or `!=`
- the value of a `const` with a plain name that the file does not export in any form, as in `const doc = globalThis.document`. The same list applies to each use of `doc`. Destructuring, as in `const { version } = globalThis.Deno`, throws on a missing global.

Every other use is a finding when no check protects it. Examples are a call, `new`, a member (`globalThis.document.title`, or `doc.title`), `instanceof`, `extends`, a spread, `for…of`, `.call`, `.apply`, `.bind`, a `return`, an export, and an argument of a call other than `Boolean`.

edgefit does not report a browser global that the code uses by its bare name, such as `document.title`. This can hide a real failure. See [Limitations](/guide/limitations).

### Code a package ships and the target does not run

A bundle can hold code that a target never runs, and that no check in the code shows. Next.js's Edge bundle holds the code for Cache Components, which Next turns off on the Edge runtime, and a timing call that only `next dev` makes. edgefit keeps a reviewed list of such cases in `data/unreached.json`: the package, the releases it was read in, the file, the APIs, the target, why the code does not run and where that is stated. A finding in a listed file is guarded and shows the reason:

```
guarded  unsupported  setImmediate  (vercel-edge)
       next@16.3.8  node_modules/next/dist/esm/server/app-render/cache-signal.js:163:23
       not reached: Only used with Cache Components, and Next.js turns the Edge runtime off for projects that enable it, except for Middleware, so a route on Vercel Edge never reaches it.
```

It applies to a check of the source and of build output alike. A release outside the listed range is checked as usual, so a new release is not assumed to behave the same. A weekly check reads the latest release and flags an entry whose file or APIs no longer match.

### A module that a package file stores

Some code keeps a Node.js module in a lookup table and reads it later, as `follow-redirects` does for `node:http` and `node:https`. A check cannot follow a module that is stored this way, so it reports the module as `unknown`. edgefit keeps a reviewed list of such files in `data/stored-modules.json`: the package, the releases it was read in, the file, the modules, the members that the file reads of them, why those are the only ones, and where that is stated. A listed file counts as a use of those members of the module, and the module is no longer `unknown`. This also covers a module that one file stores in a property of another module's export object and a third file reads, which no rule follows. A release below the listed range, another file, or a member that the list does not hold is checked as usual. A weekly check reads the latest release and flags an entry whose file or members no longer match.

### Options of the package

Some code in a package runs only when the project sets an option of its API, as `fastify` does for `http2: true`. A usage that sits behind a test of an option that its function gets, such as `if (options.http2)`, `options.http2 === true`, `options.http2 ? a : b` or `if (!options.http2) return` before the code, is guarded when no file of the graph sets that option to a value other than `false`, `0`, `null`, `undefined` or `''`. A property of an object literal, a member assignment, and a value that is not a literal count as a setting. The verbose list says `runs only when the option `http2` is set`. When the project sets the option, the usage is an ordinary finding, so run `edgefit check` on your app. An option that a function reads through a destructured parameter, or through `this`, is not recognized.

### Production builds

Every bundler replaces `process.env.NODE_ENV` with a constant for a production build and drops the code that the constant rules out. edgefit does the same on `workerd`, `netlify-edge` and `vercel-edge`, with `production` as the constant. Bun and Deno set no value, so on those targets both branches are checked. A comparison of `process.env.NODE_ENV` with a string decides which branch runs, in an `if`, `?:`, `&&`, `||`, an `else` branch, a guard clause, and a helper, a `const`, or a `let` or `var` that is not set again and holds the check. The branch that does not run is not checked, and an `import` or `require` in it is not followed. This is how React's development build, with its `MessageChannel`, stays out of a report.

To check the development build, set `env: { NODE_ENV: 'development' }` in the [config](/guide/configuration#environment).

### Helpers

A check kept in a helper is understood when the helper is in the same file, has no parameters, is not `async`, and only returns the check or tests it in one `if` (see below). So is a `const` that holds one, also one from another file (see below), and a `let` or `var` that its block does not set again:

```js
const isDeno = typeof Deno !== 'undefined';
var reading = typeof FileReader !== 'undefined';
const hasWatch = () => typeof fs.watch === 'function';

if (hasWatch() && !isDeno) fs.watch(dir, onChange);
if (reading) reader = new FileReader();
```

A helper can also test the check in one `if` and return `true` or `false`. The `if` and one `return` after it are its only statements, or the `if` has an `else` (not an `else if`) and is its only statement. The two returns must have different values. So `if (check) { return true; } return false;` holds the check, and `if (check) { return false; } return true;` holds the opposite check.

edgefit does not follow a `let` or `var` that its block sets again, because the check may no longer hold. A write is an `=`, a `++`, a loop over the name, a second `var` with a value, or a function declaration with the same name. A write in a nested function or block that declares its own variable with the same name does not count. For a `var` in a nested block, only the writes in that block count. See [Limitations](/guide/limitations).

A `const` that holds a check can also come from another file of the project or of a package. The import gives the same guards as the `const` in the other file when these are true:

- The other file declares the `const` with `export const`, or exports it with `export { name }` or `export { name as other }`, at the top level of the file.
- The importing file imports it by name, as in `import { isDeno } from './runtime.js'` or `import { isDeno as deno } from './runtime.js'`.

A file between them can pass the name on with `export { name } from` or with an import that it exports again. A `let` or `var`, a default import (`import runtime from` or `import { default as runtime } from`), a namespace import (`import * as runtime`), `export * from`, `require` and a helper do not count. A `const` whose check uses a check that its own file imports, as in `export const isNode = !isDeno && …`, gives only the guards of the part that does not use the import. A part of the check that uses a name that is local to the other file, such as a computed key or `require.main`, gives no guard. In build output, edgefit does not follow such a `const` to another file. This is a run with `--built`, or with an entry below a `nitro.json`.

A `process.domain` that is truthy, or that a comparison with `null` rules out, guards the `domain` module, because only that module sets the value. Node.js sets it to `null` first, so `typeof process.domain`, `'domain' in process` and `process.domain !== undefined` do not guard the module.

Helpers can call other helpers. edgefit does not follow a helper that is imported from another file or has parameters. It also does not follow a helper with any statement other than those above. See [Limitations](/guide/limitations).

### Functions that only checked code uses

A check also covers a function in the same file when only checked code uses the function. A use is a call of the function, its name as a value, or its name in JSX, such as `<Download />`. A use in JSX counts as a use with no check. When each use is behind a check, the code in the function gets the checks that all of the uses share:

```js
const IS_CLIENT = typeof window !== 'undefined';
const saveAs = IS_CLIENT ? downloadSaveAs : () => {};

function downloadSaveAs(blob) {
  const url = URL.createObjectURL(blob); // Guarded on Workers, which lack `window`
}
```

A use in a [polyfill store](#polyfills), such as `globalThis.fetch ??= myFetch`, also counts as a use behind a check. This check depends on the target. On a target that lacks the global, or whose data does not mark it as supported, the store runs, so the code in the function is not behind a check. A use in code that never runs, such as a branch that `NODE_ENV` rules out, does not count. A use inside the function itself does not count. The function gets no checks when:

- one use has no check
- the file exports the function in any form: `export`, `export default`, `exports.x` or `module.exports`, also inside a check
- the file sets the name again, or declares the same name again
- the file calls `eval`
- the uses share no check, such as stores to two different globals: `globalThis.fetch ??= watch` and `globalThis.Bun ??= watch`

A function that only another function calls gets no check, even when checked code calls that other function. See [Limitations](/guide/limitations).

## Clean runs

When nothing is found, edgefit prints:

```
No known incompatible reachable APIs found.
```

The wording is deliberate. It means none of the APIs edgefit could see are known to be a problem. It is not a guarantee that the project works.

## Code behind a main module check

An imported CommonJS file is not the project entry. In that file, edgefit treats `require.main === module` as false. It also reads the comparison in the reverse order, `module === require.main`. Code behind the check is not checked. This includes named functions used only by that code, with the helpers and bindings they use. A function that is exported or used elsewhere stays checked. Repeated local names stay checked.

A module that only a `require()` behind the check loads is not in the graph, as when a `NODE_ENV` check removes the branch. It stays when another live `require()` loads it. The actual graph entry keeps both branches. A local variable or parameter named `require` or `module` does not count as the CommonJS check. One parameter counts: the second parameter of a CommonJS factory, such as the `__commonJS` helper of esbuild. A factory is a function with two parameters that is given to a local helper. The helper makes a `{ exports: {} }` object. The factory sets `exports` on its second parameter and does not write to that parameter.
