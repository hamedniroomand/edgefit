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
| `mismatch`    | The API exists, but its shape differs from Node                            | warning       |
| `web`         | A Web API is missing on the target according to runtime-compat-data        | warning       |
| `unknown`     | Static analysis could not tell                                             | warning       |

### unsupported

The clearest case. Either the module or member is not there, or it is there and throws, for example `ERR_METHOD_NOT_IMPLEMENTED`. Code that reaches it will fail.

### mocked

The API exists and does not throw, but it does not do its job. On Workers, `dgram` sockets accept calls and never send anything. On Bun, `async_hooks.createHook` returns a hook that is never called. These are errors by default because they fail silently, which is worse than failing loudly.

On workerd, a Node module that is not native at your compatibility date is also reported as `mocked`, because wrangler replaces it with an [unenv](https://github.com/unjs/unenv) polyfill. In [built output mode](/guide/built-output), polyfills the build bundled are reported the same way.

### mismatch

The API exists but differs from Node: a missing property, a different arity, a different type. It may be fine for your use. Check the detail line.

### web

A Web API global or member, such as `FileReader` or `navigator.gpu`, is missing according to [runtime-compat-data](https://www.npmjs.com/package/runtime-compat-data). That data is generated automatically and is not always accurate, so it gets its own category at warning level. Where the Node compatibility matrix has measured the API directly, the matrix wins and the finding is `unsupported` instead.

Feature checks such as `if ('gpu' in navigator)` are not reported.

### unknown

edgefit could not determine what is used. Typical causes:

- `require(name)` or `import(name)` with a computed module name
- computed member access on a module that has unsupported members, such as `fs[method]`
- a module the compatibility data does not cover
- a `jsr:` import on Deno

An `unknown` finding is only reported when the access could reach something unsupported. Computed access on a module that is fully supported on the target is not reported.

Symbol keys such as `x[Symbol.iterator]` are never reported, since a symbol cannot name an API. The global object on its own (`globalThis`, `self`) is not reported either, and neither is `globalThis['crypto']`, which is read like `globalThis.crypto`.

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

When the target does not have the API, a usage that only runs after such a check is a guarded finding. It is left out of the list and does not fail a check. The report counts them (`1 guarded usage hidden`), and `--verbose` lists them. In JSON they are under `guarded`, next to `findings`.

A check does not protect an API that exists and throws or does nothing, such as `fs.watch` on Workers, because the check passes and the call still fails. Those stay findings, and so do `mocked` and `mismatch` results. Code that does not run at all on the target is the exception, see [Runtime checks](#runtime-checks).

### Checks for an API

These checks are understood:

- `if (x.y)`, `typeof x.y === 'function'`, `x.y !== undefined` and `'y' in x`, for the code they protect
- `x.y && x.y()`, `!x.y || x.y()` and `x.y ? x.y() : fallback`
- `x.y?.()`
- a guard clause such as `if (!x.y) throw …` or `return`, for the rest of the block

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

Usages in the `try` block are guarded, for the APIs the target lacks. Like a check, it does not protect an API that exists and throws. These are not guarded:

- a `try` with no `catch`, or a `catch` that throws again, even only on some errors
- the `catch` and `finally` blocks themselves
- a function defined in the block, which may run after the block has ended, and a class body
- an `import()` that nothing awaits, since its error does not reach the block. `await import(…)` does

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

The `else` branch of such a check runs on every other runtime, and a guard clause such as `if (typeof Deno === 'undefined') return` covers the rest of the block. Deno Deploy counts as Deno, and Netlify Edge Functions count as both Deno and Netlify. A check that leaves the runtime open, such as `typeof Deno !== 'undefined' || typeof Bun !== 'undefined'`, protects nothing, and neither does a check on Node (`process.versions.node`), which Bun and Deno answer too.

### Production builds

Every bundler replaces `process.env.NODE_ENV` with a constant for a production build and drops the code that the constant rules out. edgefit does the same on `workerd`, `netlify-edge` and `vercel-edge`, with `production` as the constant. Bun and Deno set no value, so on those targets both branches are checked. A comparison of `process.env.NODE_ENV` with a string decides which branch runs, in an `if`, `?:`, `&&`, `||`, an `else` branch, a guard clause, and a helper or `const` that holds the check. The branch that does not run is not checked, and an `import` or `require` in it is not followed. This is how React's development build, with its `MessageChannel`, stays out of a report.

To check the development build, set `env: { NODE_ENV: 'development' }` in the [config](/guide/configuration#environment).

### Helpers

A check kept in a helper is understood when the helper is in the same file, has no parameters, is not `async`, and does nothing but return the check. So is a `const` that holds one:

```js
const isDeno = typeof Deno !== 'undefined';
const hasWatch = () => typeof fs.watch === 'function';

if (hasWatch() && !isDeno) fs.watch(dir, onChange);
```

Helpers can call other helpers. A helper imported from another file, one with parameters, and one that does more than return a check are not followed. See [Limitations](/guide/limitations).

## Clean runs

When nothing is found, edgefit prints:

```
No known incompatible reachable APIs found.
```

The wording is deliberate. It means none of the APIs edgefit could see are known to be a problem. It is not a guarantee that the project works.
