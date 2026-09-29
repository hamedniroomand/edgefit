# Reading findings

A finding is one API, used in one package, that the target does not fully support.

## Anatomy of a finding

```
error    unsupported  node:fs.watch  (workerd)
       file watching is not implemented; throws ERR_UNSUPPORTED_OPERATION
       chokidar@4.0.1  node_modules/chokidar/index.js:5:13
       via src/index.ts > src/dev/reload.ts > chokidar
       see https://github.com/cloudflare/workerd/tree/v1.20260424.1/src/node/internal/internal_fs_callback.ts
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

## Guarded usages

Code often checks for an API before it uses it:

```js
if (typeof subtle.getPublicKey != 'function') {
  throw new TypeError('the key must be extractable');
}
await subtle.getPublicKey(key, []);
```

When the target does not have the API, a usage that only runs after such a check is a guarded finding. It is left out of the list and does not fail a check. The report counts them (`1 guarded usage hidden`), and `--verbose` lists them. In JSON they are under `guarded`, next to `findings`.

A check does not protect an API that exists and throws or does nothing, such as `fs.watch` on Workers, because the check passes and the call still fails. Those stay findings, and so do `mocked` and `mismatch` results.

These checks are understood:

- `if (x.y)`, `typeof x.y === 'function'`, `x.y !== undefined` and `'y' in x`, for the code they protect
- `x.y && x.y()`, `!x.y || x.y()` and `x.y ? x.y() : fallback`
- `x.y?.()`
- a guard clause such as `if (!x.y) throw …` or `return`, for the rest of the block

A check only covers the API it names, and anything below it. `if (fs.watchFile)` does not guard `fs.watch`. See [Limitations](/guide/limitations) for the checks that are not understood yet.

## Clean runs

When nothing is found, edgefit prints:

```
No known incompatible reachable APIs found.
```

The wording is deliberate. It means none of the APIs edgefit could see are known to be a problem. It is not a guarantee that the project works.
