# Changelog

## 0.13.0

### Minor Changes

- [#227](https://github.com/hamedniroomand/edgefit/pull/227) [`6e1c38b`](https://github.com/hamedniroomand/edgefit/commit/6e1c38b9f33513a7c10d440604c74c060b6e6c6c) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Keep a resolve error with the target whose module graph failed, and check the other targets. Before, one target that could not resolve a module, such as `workerd` for `@node-rs/argon2` whose `browser` field selects a file that imports a module that is not installed, stopped the whole run, and Bun and Deno got no result. `check()` now returns `failed` for that target, `edgefit check` prints the other reports and then the error, `compare` shows a column for it, and the exit code is 2. `edgefit package` shows the cell of that target as not checked or as an error, and the other targets keep their result. When every target fails, the first error is still thrown.

### Patch Changes

- [#242](https://github.com/hamedniroomand/edgefit/pull/242) [`9bf3d56`](https://github.com/hamedniroomand/edgefit/commit/9bf3d56a2354f5b665f79874a631a86ae7713899) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Follow a Node.js module into a function that the code calls at once, as in `(function (stream) { stream.write('x'); })(process.stderr)`. A parameter, or a member of it, that a class extends counts as a parent class. So does the second argument of a helper of the file that sets `Child.prototype` from `parent.prototype`, as CoffeeScript writes `extend(Child, parent)`. A `.call`, `.apply` or `.bind` of a parameter is a use of the parameter itself.

- [#239](https://github.com/hamedniroomand/edgefit/pull/239) [`cd6d354`](https://github.com/hamedniroomand/edgefit/commit/cd6d3541f51a63f4164df34198ef3452f99f924c) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Read a computed key from a list of strings: a `for...of` name, the parameter of a `forEach` callback, an element of an array or of an object, a `.map` that joins a string, and a `const` that the file declares later. A `let` or a `var` holds each value written to it. A `typeof` check and an `if (!obj[key])` fallback guard the same read.

- [#233](https://github.com/hamedniroomand/edgefit/pull/233) [`762bfcf`](https://github.com/hamedniroomand/edgefit/commit/762bfcf59f305eab885d5f2015786f3121b3fa31) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Read JSONC and TOML config files with confbox. An invalid `tsconfig.json` gives no compiler options.

- [#236](https://github.com/hamedniroomand/edgefit/pull/236) [`400b711`](https://github.com/hamedniroomand/edgefit/commit/400b711063f0cc83fc07616e0b8dc64dc3b4202c) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Treat a `var` or `let` that holds a guard expression like a `const` when its block does not set the name again, so patterns such as `var ok = typeof FileReader !== 'undefined'` guard later uses.

- [#241](https://github.com/hamedniroomand/edgefit/pull/241) [`b208a08`](https://github.com/hamedniroomand/edgefit/commit/b208a08359af7c010f5e73653873ceeb9d030385) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - A check of a computed key guards only a read through the name that the same scope declares. A key that a nested function writes, and a `var` with the name of a parameter or of a function, stay unknown.

- [#230](https://github.com/hamedniroomand/edgefit/pull/230) [`19f1d26`](https://github.com/hamedniroomand/edgefit/commit/19f1d260d52b96476e7b5f64b31866d6910fbbf4) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Report a missing module loaded by `require()` inside a function as `unknown`. Keep top-level missing loads as resolve errors. Apply the rule to project and package checks.

- [#235](https://github.com/hamedniroomand/edgefit/pull/235) [`01e1f5b`](https://github.com/hamedniroomand/edgefit/commit/01e1f5ba9bac3ed2470bbfb6b044b2dd278eb2bf) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Read a destructuring assignment from `import()` or `require()` as a load of those names. A `catch` that throws again only when `error.code` is not the code of a missing module guards the load of that module. On a target that lacks the whole module, it also guards the members that the rest of the `try` block reads.

- [#243](https://github.com/hamedniroomand/edgefit/pull/243) [`aff8915`](https://github.com/hamedniroomand/edgefit/commit/aff8915312258386e4dad333cd63dc9c2124061b) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Cover `nodemailer` 10.0.15 in the list of code that a package ships and a target does not run. The `node:child_process.spawn` finding of the sendmail transport is guarded on workerd for this release, as it is for 10.0.13 and 10.0.14.

- [#236](https://github.com/hamedniroomand/edgefit/pull/236) [`400b711`](https://github.com/hamedniroomand/edgefit/commit/400b711063f0cc83fc07616e0b8dc64dc3b4202c) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Guard the `domain` module behind a truthy read of `process.domain`, or a comparison that rules out `null`, because only that module sets the value, so code such as `asap` that loads `domain` only when `process.domain` is set gives no `unknown node:domain` warning.

- [#232](https://github.com/hamedniroomand/edgefit/pull/232) [`44a3bff`](https://github.com/hamedniroomand/edgefit/commit/44a3bff72d8232c228864ec346f3423923ebbc3b) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Leave out CLI code behind `require.main === module` in imported CommonJS files. Keep CLI code when the file is a project entry.

- [#234](https://github.com/hamedniroomand/edgefit/pull/234) [`e90b8a6`](https://github.com/hamedniroomand/edgefit/commit/e90b8a6666fd5e6ca72504fa2c1de4408f190c68) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Follow a re-export of a Node.js module. `export { promises as fsp } from 'node:fs'` is `node:fs.promises` under `fsp`. `export * as fs from 'node:fs'` is the module under `fs`.

## 0.12.1

### Patch Changes

- [#225](https://github.com/hamedniroomand/edgefit/pull/225) [`2eebdef`](https://github.com/hamedniroomand/edgefit/commit/2eebdefd8985c7c1dbf9fff186c127b10ee748c2) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Leave out a module that the `browser` field of a package maps to `false`. esbuild names it `(disabled):…`, and edgefit tried to open that name as a file, so `edgefit check` and `edgefit package` stopped with ENOENT on a package such as `sanitize-html`. An import of such a module now gives nothing.

## 0.12.0

### Minor Changes

- [#222](https://github.com/hamedniroomand/edgefit/pull/222) [`6e58d71`](https://github.com/hamedniroomand/edgefit/commit/6e58d7120aa10bda38aabf78e7bd5f1aef936ec0) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Read `module.exports = name` as the whole export of a CommonJS file when `name` holds a Node.js module, as `protobufjs` and `@protobufjs/fetch` write it with `var fs = null; try { fs = require('fs') } catch {}`. A file that binds the result of `require()` to a name, or destructures it, gets the members it reads as uses of the module, with its own guards. When every file that loads it does so, the module is no longer reported as `unknown` in the exporting file. `data/stored-modules.json` lists the one case that no rule follows: `protobufjs` stores the module in a property of another export object and reads it in a third file. `firebase/firestore` on Deno no longer has the two `unknown node:fs` warnings.

## 0.11.0

### Minor Changes

- [#202](https://github.com/hamedniroomand/edgefit/pull/202) [`e58940d`](https://github.com/hamedniroomand/edgefit/commit/e58940d6854c7b98f454aeb646f2780c27460c2f) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Read `exports.name = { … }` as the export `name`. The functions and methods in the object count once the export is used. Any other value in it, such as a call, a member read or a spread, counts when the module loads. A CommonJS module with such an export, such as `credentials` in `@grpc/grpc-js`, can now be traced, so the exports that nothing uses are left out of the check.

- [#204](https://github.com/hamedniroomand/edgefit/pull/204) [`7b03938`](https://github.com/hamedniroomand/edgefit/commit/7b039385698ef216bbf5b7605e4ab9d834fb2283) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Read more forms of a CommonJS module, so that a file such as `index.js` of `mysql2` can be traced. `exports.__defineGetter__('name', fn)` is a getter export. `exports.name = <value>` is an export when the module computes the value when it loads, and `exports.other = exports.name` is the same export under another name. `module.exports = name` is read when `name` is a function or class of the module that nothing else names. A `require` inside a function asks for its module only when the function is used. A Worker that imports `createConnection` from `mysql2` no longer gets the finding of `createServer`.

- [#206](https://github.com/hamedniroomand/edgefit/pull/206) [`166aa7c`](https://github.com/hamedniroomand/edgefit/commit/166aa7ca4634ea076b97d49cfc702b44b08b0649) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - List the findings that only some exports of a package entry reach under those exports, and do not count them in the status of the entry. `edgefit package mysql2` now passes on Workers, with `createServer` named with its `mismatch node:net.createServer`, because only that export needs a port that a Worker cannot open. The package result has `exports` for each entry and `worstExport` for each target, `edgefit package` prints a line for each export and the worst export, and the package table shows the worst export as a third mark and in the row detail. `check` takes the option `byExport`, which sets `Finding.exports`. The result version stays 2, since the fields are new.

- [#203](https://github.com/hamedniroomand/edgefit/pull/203) [`09ada3b`](https://github.com/hamedniroomand/edgefit/commit/09ada3b4b02da5aae46dfddd0c59581ce013196d) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Add `data/stored-modules.json`, a reviewed list of package files that keep a Node.js module in a lookup table and read only some members of it. A listed file counts as a use of those members, so the module is no longer reported as `unknown`. The first entry is `follow-redirects`, which `axios` uses for `node:http` and `node:https`. `edgefit package axios` now passes on Deno.

### Patch Changes

- [#207](https://github.com/hamedniroomand/edgefit/pull/207) [`15e7e05`](https://github.com/hamedniroomand/edgefit/commit/15e7e0509da99f3672c1ee618daf3c19c2fdaf04) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Cover `nodemailer` 10.0.14 in the list of code that a package ships and a target does not run. The `node:child_process.spawn` finding of the sendmail transport is guarded on workerd for this release, as it is for 10.0.13.

- [#208](https://github.com/hamedniroomand/edgefit/pull/208) [`39c5dfc`](https://github.com/hamedniroomand/edgefit/commit/39c5dfc839859a90136bdc36a977179714b98470) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Cover `postal-mime` 4.0.3 and 4.0.4 in the list of code that a package ships and a target does not run. The `FileReader` finding of `blobToArrayBuffer` is guarded on workerd and Bun for these releases, as it is for 4.0.2.

## 0.10.0

### Minor Changes

- [#191](https://github.com/hamedniroomand/edgefit/pull/191) [`8f298a1`](https://github.com/hamedniroomand/edgefit/commit/8f298a16362e39dc540a99b5aa3bf185ced52014) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Read a template literal or a `+` of strings and `const` strings as the string it spells, for `require()` and `import()`. The call ``require(`cardinal${SUFFIX}`)`` with `const SUFFIX = ''` is a `require('cardinal')` and no longer an `unknown` access. A join with a name that is not a `const` string stays `unknown`.

- [#195](https://github.com/hamedniroomand/edgefit/pull/195) [`c7f1a8c`](https://github.com/hamedniroomand/edgefit/commit/c7f1a8c7317c71fa4073df5142442723ab2cd9b5) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Read `import * as ns from './file'` the same way as a `require` that is only read by member: the file is asked only for the members read from `ns`, and a Node.js module that it exports under one of them is that module in the reading file. A `ns` that is passed on, stored, exported again or read with a computed key still asks for all of the file. A file that is imported as a namespace no longer reports the unused exports of the file as findings, so `edgefit check` can show fewer findings. The ESM and the CommonJS build of one package now give the same result.

- [#194](https://github.com/hamedniroomand/edgefit/pull/194) [`beb30b1`](https://github.com/hamedniroomand/edgefit/commit/beb30b121d839d11ea4fdbd2fc17c85c3d018bc4) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Follow a variable that is set to a module in a `try` and to a literal, an object, an array or a template in the `catch`, as in `let http2; try { http2 = require('node:http2') } catch { http2 = { constants: {} } }`. The fallback is no longer a second write. A second write that may hold a module, such as `m = other ? require('b') : null`, still is. `edgefit package cheerio` gives ✓ on Bun and Deno.

- [#195](https://github.com/hamedniroomand/edgefit/pull/195) [`c7f1a8c`](https://github.com/hamedniroomand/edgefit/commit/c7f1a8c7317c71fa4073df5142442723ab2cd9b5) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Follow a file that another file loads with `const x = require('./file')` or `const x = await import('./file')` and only reads by member, as in `x.crypto.randomBytes(8)`. The module that the file exports under `crypto` is that module in the file that reads it, and the export is no longer `unknown`. This is the form that `tsc` writes for CommonJS. A name that is passed on, stored, written to or read with a computed key keeps the `unknown`. `edgefit package @anthropic-ai/sdk` gives ✓ on Bun and Deno for `./client.js`, `./index.js` and `./resources.js`.

- [#193](https://github.com/hamedniroomand/edgefit/pull/193) [`c970e1c`](https://github.com/hamedniroomand/edgefit/commit/c970e1c2d1685c42648db65e7bffa2dff5a47a34) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Read an object whose values are all functions that only return `require('node:x')` as the loads of those modules, when every use of the object is a call of one of its functions, as in `loaders[name]()`. A call with a key that is not a known string counts every module of the object. `undici` writes this for its runtime checks. An object that the code passes on, or reads without a call, stays `unknown`.

- [#188](https://github.com/hamedniroomand/edgefit/pull/188) [`b594ff4`](https://github.com/hamedniroomand/edgefit/commit/b594ff40829ac9c38d6959d63b9a101e9a0327c7) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Report a package that loads a native addon through a loader, such as `node-gyp-build`, `bindings`, `node-pre-gyp` or a platform package with a `.node` file, as a native addon. `edgefit package sqlite3`, `bcrypt` and `better-sqlite3` now fail on workerd, netlify-edge and vercel-edge and pass on Bun and Deno. The computed `require` inside such a loader is no longer reported as `unknown`.

- [#197](https://github.com/hamedniroomand/edgefit/pull/197) [`6b00e3a`](https://github.com/hamedniroomand/edgefit/commit/6b00e3a3e12bf8b2e3bd31b93c9eec22a8756f56) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Add `--main <subpath>` to `edgefit package`, and a `main` option to `checkPackage`. A package without a `.` entry, such as `firebase`, can name the subpath that stands for it. The result of each target then comes from that subpath, the output prints `main entry: ./app`, and the worst subpath is still named when it is worse. The JSON result has `main`, and a row of the package table can set it.

- [#192](https://github.com/hamedniroomand/edgefit/pull/192) [`783525c`](https://github.com/hamedniroomand/edgefit/commit/783525c213e19383a02444dc4e4538f626d7e7d9) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Bind the names of `const [a, b] = await Promise.all([x, y])` by position, when an element is a module that edgefit tracks: a Node.js module, `import()` of one, or a call of a function that only imports its argument. The name, or an object pattern such as `{ default: fs }`, then counts the members that the code reads on it. A spread or a hole in the list, a rest element, and an element that is not a module leave the names after them unbound. `edgefit package elysia` gives ✓ on workerd, Bun and Deno. A call of a function that only imports its argument also binds a name that holds its result, as in `const fs = await load('node:fs')`.

- [#189](https://github.com/hamedniroomand/edgefit/pull/189) [`3cd8b04`](https://github.com/hamedniroomand/edgefit/commit/3cd8b0402b233a9fa8c51d262d313ee037ca4999) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Read a module that is passed to a function of the same file as the members that the function reads on that parameter. `print(process.stderr)` with `stream.write()` inside `print` is a use of `process.stderr.write` and no longer an `unknown` access. The same goes for a module in an object literal that is passed that way. A parameter that the function stores, returns, passes on or sets keeps the `unknown`.

- [#189](https://github.com/hamedniroomand/edgefit/pull/189) [`3cd8b04`](https://github.com/hamedniroomand/edgefit/commit/3cd8b0402b233a9fa8c51d262d313ee037ca4999) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - List a `require()` or `import()` of a name that the user of the code gives as a note, not as an `unknown` finding. A parameter of the function around it, a property of one, or a value set from one gives the name, as in `require(options.engine)`, when the file does not call that function by its name. `edgefit package express` gives ✓ with the note `loads a module the user names (view.js:81)`. `edgefit check` prints the same note, with the name of the package, under the target header, and the JSON output has it as `suppliedLoads`. A name built with a prefix, such as `'./locales/' + name`, stays `unknown`.

### Patch Changes

- [#189](https://github.com/hamedniroomand/edgefit/pull/189) [`3cd8b04`](https://github.com/hamedniroomand/edgefit/commit/3cd8b0402b233a9fa8c51d262d313ee037ca4999) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - List the `mongocryptd` spawn of `mongodb` 7.6.0 as unreached on workerd, as for 7.7.0. `edgefit package mongoose`, which bundles 7.6.0, gives ✓ on workerd.

## 0.9.3

### Patch Changes

- [#166](https://github.com/hamedniroomand/edgefit/pull/166) [`5423d5e`](https://github.com/hamedniroomand/edgefit/commit/5423d5e61ea4b8f9067b2792ec615a149c532399) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Read a member in any place of an `&&` or `||` chain as a check when the chain only decides an `if`, a loop, a `?:` test or a `!`. `if (a && globalThis.BroadcastChannel && b)` no longer reports `BroadcastChannel` on its own line.

- [#173](https://github.com/hamedniroomand/edgefit/pull/173) [`cf55110`](https://github.com/hamedniroomand/edgefit/commit/cf551101d5086f5743eaab5bcd8ef56791b3e0c5) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Read a computed key that holds a plain string, or a member of an object whose values are all plain strings, as those strings. `console[method]()` with `const method = Methods[level]` checks each method and is no longer reported as `unknown`. A `let`, a parameter, or an object with another kind of value stays `unknown`.

- [#177](https://github.com/hamedniroomand/edgefit/pull/177) [`24f5fe4`](https://github.com/hamedniroomand/edgefit/commit/24f5fe4804d82e4eacd2a692d382c5313cb3e46f) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Treat `fs.F_OK` as supported on Deno. The member is missing there, but `fs.access` takes an undefined mode as `F_OK`, so `fs.access(path, fs.F_OK, callback)` works the same. `fs.R_OK`, `fs.W_OK` and `fs.X_OK` are still reported, because an undefined mode checks only that the file exists. The data has a new field, `missingHarmless`, for an API that is missing on purpose, so the weekly runtime probe does not report it as stale.

- [#169](https://github.com/hamedniroomand/edgefit/pull/169) [`b21aef3`](https://github.com/hamedniroomand/edgefit/commit/b21aef376921b62add23729e989330d59f15a2fd) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Read `const { a, b } = await import('./file')` as an import of the names `a` and `b`. The file is asked for those names only, so code that nothing uses is left out, and a Node.js module that the file exports under one of them is followed in the importing file. An `import()` that is stored whole, passed on, or destructured with a rest element or a nested pattern still takes the whole file.

- [#169](https://github.com/hamedniroomand/edgefit/pull/169) [`b21aef3`](https://github.com/hamedniroomand/edgefit/commit/b21aef376921b62add23729e989330d59f15a2fd) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Follow a Node.js module that one file exports under a name and another file of the graph imports by that name. `crypto.createHash()` in the importing file counts as a use of `node:crypto`, and the export is no longer reported as `unknown`. The export stays `unknown` when nothing imports the name, when a file imports the whole file, or when it is re-exported again.

- [#169](https://github.com/hamedniroomand/edgefit/pull/169) [`b21aef3`](https://github.com/hamedniroomand/edgefit/commit/b21aef376921b62add23729e989330d59f15a2fd) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Read `const { a } = require('./file')`, and the form that `tsc` writes for `import()` in CommonJS, as an import of the name `a`, and read `exports.name = binding` of a Node.js module as an export of it. A Node.js module that one CommonJS file exports and another destructures is followed in the importing file. A `require()` that is stored whole or read as `require('./file').name` still takes the whole file.

- [#165](https://github.com/hamedniroomand/edgefit/pull/165) [`f369253`](https://github.com/hamedniroomand/edgefit/commit/f369253631fa71f3d928dbfed855624e6405ad1e) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Read an operand of `||` or `??` as a check for an API, as in `util.getCallSites ?? util.getCallSite`. An API that the target lacks gives no finding there, and an API that exists and throws still does. A value that is called in place, such as `(x.y || z)()`, and the right operand of an expression whose left operand is not an API are still uses.

- [#167](https://github.com/hamedniroomand/edgefit/pull/167) [`bd13cd9`](https://github.com/hamedniroomand/edgefit/commit/bd13cd9150f79a2749b1d57f7757df03dcd84aec) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - `edgefit package` takes the result of a target from the main entry (`.`). The worst subpath is named on a `worst subpath` line, and in the `worst` field of the JSON result, when it is worse. The package table does the same. In the result, `summary` now means the main entry, and the result version is 2. The aggregate of the table has a `worst` field instead of `main` and `decidedBy`. A package without a main entry takes its worst subpath, as before.

- [#168](https://github.com/hamedniroomand/edgefit/pull/168) [`1c4cce0`](https://github.com/hamedniroomand/edgefit/commit/1c4cce0e3720535f3a8e1c934f6cbd147a9552d0) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - `edgefit package` lists an optional peer dependency that is not installed as a note of the entry, not as an `unknown` warning. The entry status comes from the other findings. `edgefit check` on a project still reports it as `unknown`.

- [#172](https://github.com/hamedniroomand/edgefit/pull/172) [`5ed13c0`](https://github.com/hamedniroomand/edgefit/commit/5ed13c05ada4e6dc7d37f28aa951e513447b3e51) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Follow a function with no parameter that only returns `require('node:x')`, with or without a `try` whose `catch` returns nothing. A variable that holds the call is a module binding, so the members that the code reads are checked, and the `require` inside the function is no longer reported as passed on. A function that is exported, passed on, or has a parameter or a second statement is not followed.

- [#175](https://github.com/hamedniroomand/edgefit/pull/175) [`5a8df74`](https://github.com/hamedniroomand/edgefit/commit/5a8df74755b8f7679dd40c93f8458b11f6c0979b) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - List the sendmail transport of `nodemailer` and the `mongocryptd` spawn of `mongodb` as code that `workerd` never reaches. Both start a local process that a Worker does not have. The two packages no longer fail on `node:child_process.spawn`.

- [#174](https://github.com/hamedniroomand/edgefit/pull/174) [`df689eb`](https://github.com/hamedniroomand/edgefit/commit/df689eb5c915ac871e52b790f9d81db3cc82e00b) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - List the browser-only paths of `@supabase/auth-js` and `@supabase/realtime-js` as code that `workerd` and Bun never reach: the `navigator.locks` lock that only the deprecated `lock` option uses, and the Web Worker heartbeat that only the `worker` option starts. `@supabase/supabase-js` no longer fails on them.

- [#164](https://github.com/hamedniroomand/edgefit/pull/164) [`365bfd5`](https://github.com/hamedniroomand/edgefit/commit/365bfd5e447ab59b029651a6893d1176bf435722) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Guard an API that exists and throws inside a `try` block whose `catch` does not throw again. A promise that nothing awaits is still reported, and a check such as `if (x.y)` still does not protect an API that exists and throws.

## 0.9.2

### Patch Changes

- [#147](https://github.com/hamedniroomand/edgefit/pull/147) [`f534708`](https://github.com/hamedniroomand/edgefit/commit/f534708d9192ed3f8a7f64f1f75ae009305cf76a) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Follow a variable that holds a value when it is declared and is set once to a required module, such as `var crypto = null; crypto = require('crypto')`. A member read on the variable is a use of the module, and a check on it is a guard.

- [#144](https://github.com/hamedniroomand/edgefit/pull/144) [`1c97f9d`](https://github.com/hamedniroomand/edgefit/commit/1c97f9d3bd6a98e5f224e95cf56e7cfa319a2a60) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Do not report a computed read of the global object that is only compared. `globalThis[name] === value` no longer gives an `unknown` warning. A call, a member read or a value passed on is still reported.

- [#145](https://github.com/hamedniroomand/edgefit/pull/145) [`e51d8cc`](https://github.com/hamedniroomand/edgefit/commit/e51d8ccdcac3aa911953684ca70cceb4293d6af1) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - An exported alias of a global that the target has, such as `export { FastURL }` for `URL`, is no longer reported as unknown.

- [#142](https://github.com/hamedniroomand/edgefit/pull/142) [`1d367a3`](https://github.com/hamedniroomand/edgefit/commit/1d367a36203391660b2f719365313c457122cd75) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Read a conditional of the global object, such as `typeof window !== 'undefined' ? window : globalThis`, as an alias of the global object. A member check through the alias now guards the same global.

- [#148](https://github.com/hamedniroomand/edgefit/pull/148) [`7712c77`](https://github.com/hamedniroomand/edgefit/commit/7712c77eaa97c22a207a5c79ece3c56df3b995c3) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Follow a function that only runs `import(specifier)` for its one parameter, such as `const load = specifier => import(specifier)`, when every use of it is a call with a literal. Each call is read as an import of the literal, and the module is added to the graph. A function that is exported, passed on, or called with anything else is still reported as `import(<expression>)`.

- [#143](https://github.com/hamedniroomand/edgefit/pull/143) [`227c3a2`](https://github.com/hamedniroomand/edgefit/commit/227c3a284dd37d2a3073843dd18bb0a17d8411dd) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Read optional chaining as a check. `a?.b` and `a?.b?.()` no longer use `b`, and an `if` that tests them guards its branch. A guarded use of an API that the data does not cover is listed as guarded, not as an `unknown` warning.

- [#150](https://github.com/hamedniroomand/edgefit/pull/150) [`9be1e09`](https://github.com/hamedniroomand/edgefit/commit/9be1e09c5a574487e2a5750baf8476826158eef5) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - List the `FileReader` fallback of `postal-mime` as code that `workerd` and Bun never reach. Both have `Blob.prototype.arrayBuffer`, which the function checks first, so the finding is reported as guarded.

- [#146](https://github.com/hamedniroomand/edgefit/pull/146) [`bebf6d6`](https://github.com/hamedniroomand/edgefit/commit/bebf6d60af95c28da083c8dd6f80aa1e1e689178) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Read a call through a sequence expression, such as `(0, ns.member)()` in `tsc` output, as a call of the member. A module that the call reaches through `__importDefault` is no longer reported as passed on as a value.

## 0.9.1

### Patch Changes

- [#139](https://github.com/hamedniroomand/edgefit/pull/139) [`9e46e8f`](https://github.com/hamedniroomand/edgefit/commit/9e46e8f6dbfdc3258066724b4ddf2bfa19595767) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Do not report a write to a missing member as unsupported. `process.report.excludeNetwork = true` no longer gives an error on Bun, because the write does not throw when `process.report` exists. A write to a member of a missing object is still reported.

- [#138](https://github.com/hamedniroomand/edgefit/pull/138) [`5394622`](https://github.com/hamedniroomand/edgefit/commit/5394622304c6e22e9b912273886bb52a3642c774) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Accept an optional peer dependency when the project root is behind a symlink. `edgefit package` on macOS no longer gives `?` for a package with an optional peer.

- [#140](https://github.com/hamedniroomand/edgefit/pull/140) [`6a06a99`](https://github.com/hamedniroomand/edgefit/commit/6a06a99d3c21c568d2ff39285076d2e798fb73ff) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Stop the `tsconfig.json` search at the project root. A config above the root no longer makes an import that the project uses only as a type fail to resolve. A project with no config of its own is checked as if the bundler had none.

- [#149](https://github.com/hamedniroomand/edgefit/pull/149) [`25d2e7b`](https://github.com/hamedniroomand/edgefit/commit/25d2e7ba6be5d473e545c7d15361f7e6533dbdff) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - `edgefit package` lists a subpath that needs a module the package does not declare as not checked, instead of failing the whole package. The result of the other subpaths decides the row.

## 0.9.0

### Minor Changes

- [#107](https://github.com/hamedniroomand/edgefit/pull/107) [`34bd26d`](https://github.com/hamedniroomand/edgefit/commit/34bd26d5d3851a56d0f1ecb55a175ef88d6ea3e9) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Add a stable `id` to each finding in the JSON report, and publish the JSON schema of the report. The npm package includes the schema as `edgefit/schema/report-v2.json`. Build output with no file of the project is now one finding for each API, so `edgefit diff` does not report it as fixed and new when a chunk name changes.

## 0.8.0

### Minor Changes

- [#106](https://github.com/hamedniroomand/edgefit/pull/106) [`6414a3a`](https://github.com/hamedniroomand/edgefit/commit/6414a3a75c53aaeeed90fb4fadd7ae30b5fa0829) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Check a Deno workspace member. The member inherits the `imports` of the workspace root, and `jsr:` imports of workspace members are followed. The warning for another `jsr:` package names the package.

- [#120](https://github.com/hamedniroomand/edgefit/pull/120) [`7863694`](https://github.com/hamedniroomand/edgefit/commit/786369407ca866fa6b0f75043add8459f09d3a6c) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - The `netlify-edge` target now uses what edgefit measured on Netlify. Netlify runs Deno 2.3.1, so the report names that version. `child_process` and the `fs` write APIs are now errors, because Netlify blocks subprocesses and grants write access to `/tmp` only. APIs that Deno 2.3.1 has and later Deno releases removed, such as `util.isString`, are no longer reported.

- [#123](https://github.com/hamedniroomand/edgefit/pull/123) [`09dd24e`](https://github.com/hamedniroomand/edgefit/commit/09dd24e6f718d820ab5fb6b3db3763a2b488d20f) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - The `vercel-edge` target now uses what edgefit measured on Vercel, as middleware and as an edge function. `DOMException`, `WeakRef` and `FinalizationRegistry` are reported as missing, because edge functions lack them, and `async_hooks.AsyncResource` is reported as missing, because middleware lacks it. Each note names the one that has the API. Next.js's own use of `WeakRef` is reported as guarded, because Next.js checks for `FinalizationRegistry` first.

## 0.7.0

### Minor Changes

- [#111](https://github.com/hamedniroomand/edgefit/pull/111) [`1aabf8c`](https://github.com/hamedniroomand/edgefit/commit/1aabf8c3bda7b13c77ff17894dc2257496af2177) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - A CommonJS module that requires another module through a compiler helper now asks that module only for the members it reads. The helpers are the members of `@swc/helpers`, the `__importDefault`, `__importStar` and `__exportStar` that `tsc` defines, and the same helpers of `tslib`. Any other wrapper still asks for all of the module.

- [#109](https://github.com/hamedniroomand/edgefit/pull/109) [`773c11a`](https://github.com/hamedniroomand/edgefit/commit/773c11a1f503620035e79e22d6bb7a2c1facde05) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Report `require(<expression>)` as an error on `vercel-edge`. Vercel bundles a static `require`, but a `require` whose module is computed at runtime cannot work there. It stays an `unknown` warning on the other targets, and inside `try`.

- [#110](https://github.com/hamedniroomand/edgefit/pull/110) [`68a1189`](https://github.com/hamedniroomand/edgefit/commit/68a118921b1ae4be770b77c6b30d0343317b9782) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - The `vercel-edge` target now warns on `WebAssembly.instantiate` when its first argument is not an imported `.wasm` module, since Vercel's Edge runtime does not compile Wasm from bytes.

## 0.6.3

### Patch Changes

- [#102](https://github.com/hamedniroomand/edgefit/pull/102) [`2749b14`](https://github.com/hamedniroomand/edgefit/commit/2749b146f8297a286534a59238c169eb95fdf5fe) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Treat a class that extends a Node.js class, or `util.inherits` with one, as a use of that class. The rest of the module is no longer reported as `unknown`.

- [#104](https://github.com/hamedniroomand/edgefit/pull/104) [`fb9542c`](https://github.com/hamedniroomand/edgefit/commit/fb9542c20e3577f14c37afab564d8b4654990bb9) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Follow a variable that is declared without a value and set once to a required module, such as `let c; c = require('node:crypto')`. Its members now count as uses of the module, and no `unknown` warning shows.

- [#103](https://github.com/hamedniroomand/edgefit/pull/103) [`fdb804b`](https://github.com/hamedniroomand/edgefit/commit/fdb804b7d42d7510f7a88bb06feba28866858f55) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Do not report a computed access with a symbol key held in a `const`.

- [#101](https://github.com/hamedniroomand/edgefit/pull/101) [`879bf74`](https://github.com/hamedniroomand/edgefit/commit/879bf741b1547c174f5f9d1acb41c4428a7dbcb0) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Stop reporting Web APIs and `process` members as missing on Bun, Deno and workerd when the runtime has them, such as `AbortSignal.any` on Bun. The probe now also looks up the Web APIs that the data marks missing.

## 0.6.2

### Patch Changes

- [#100](https://github.com/hamedniroomand/edgefit/pull/100) [`34c3878`](https://github.com/hamedniroomand/edgefit/commit/34c3878ce2f6cd82fb85b76096322c14a21ffb58) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Report a native addon as a finding instead of stopping the check.

- [#98](https://github.com/hamedniroomand/edgefit/pull/98) [`24a4791`](https://github.com/hamedniroomand/edgefit/commit/24a47911614451a1eaa6ba9dc86ed58898275752) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Stop reporting a constant value of a Node module as mocked on `workerd` when the unenv polyfill provides it, such as `EOL` from `node:os`. Functions and classes are still reported.

## 0.6.1

### Patch Changes

- [#93](https://github.com/hamedniroomand/edgefit/pull/93) [`7ae1c43`](https://github.com/hamedniroomand/edgefit/commit/7ae1c4326239dd879c217344334a68f3f465ca76) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - An optional peer dependency that is not installed no longer makes a package `?`. When an import fails and the importing package lists the module in `peerDependenciesMeta` as optional, edgefit leaves the module out and reports an `unknown` warning that names it. Other imports that fail still give `?`.

- [#96](https://github.com/hamedniroomand/edgefit/pull/96) [`f374838`](https://github.com/hamedniroomand/edgefit/commit/f374838faa5aef415b760c1daedec3ab43a32639) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - A Node.js module that code stores in a global the target already has, such as `globalThis.crypto ??= crypto`, no longer gives an `unknown` warning. The store only runs when the global is missing, so edgefit lists it as guarded. The forms are `??=`, `||=`, and an assignment after a check such as `if (!globalThis.crypto)`. The warning stays on a target that lacks the global.

- [#97](https://github.com/hamedniroomand/edgefit/pull/97) [`9b5801b`](https://github.com/hamedniroomand/edgefit/commit/9b5801b9f17b83ff9f15af363b15769665e2e40b) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - An import that is only used as a type no longer gives a finding. A bundler drops such an import from a TypeScript file, so `import { ServerResponse } from 'node:http'` that is only used in `as ServerResponse` uses no API. When an import has some names used as values, edgefit reports only those names. The check still keeps every import when the nearest `tsconfig.json` sets `verbatimModuleSyntax`, `preserveValueImports`, or `importsNotUsedAsValues` to `preserve` or `error`.

## 0.6.0

### Minor Changes

- [#75](https://github.com/hamedniroomand/edgefit/pull/75) [`f81a75d`](https://github.com/hamedniroomand/edgefit/commit/f81a75dcb62e73adeb57c839846e91639a5313b4) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - `--entry` can be given more than once, and `entry` in the config can be an array. Both accept globs, which skip `node_modules`. All entries are resolved in one build, so a module shared by two entries is scanned once and its findings are reported once. Netlify Edge checks every function without `--entry`. A target with no entry of its own uses the entries of the first target that has some, and the report notes it. The JSON report is version 2: `entry` is now `entries`. `edgefit diff` still reads a version 1 report as the base. The Action's `entry` input takes one entry per line.

- [#76](https://github.com/hamedniroomand/edgefit/pull/76) [`15a1cf2`](https://github.com/hamedniroomand/edgefit/commit/15a1cf22cd939cd8cbde8459131b8181c4920f60) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - Every target finds its own entries. Bun reads `package.json` `module`, then the start and dev scripts, then `index.ts`. Deno reads `deno.json` `exports`, then the `start` and `dev` tasks, then `main.ts`. Vercel Edge takes the middleware and every `api/**`, `pages/api/**` and `app/**/route.*` file that sets `runtime: 'edge'`. Netlify Edge also takes functions that export `config` with a `path` or `pattern`. Workerd, Bun and Deno fall back to `package.json` `exports`, `module` and `main`, then `src/index.*` and `index.*`. Entries read from a command or a file name are marked as guessed in the report. Nothing is guessed at a workspace root. A target with no entry is skipped, and the text, GitHub, `diff` and `compare` output list what it searched; the JSON reports have a `skipped` list. See [How entries are found](https://edgefit.kitdev.space/guide/configuration#how-entries-are-found).

- [#78](https://github.com/hamedniroomand/edgefit/pull/78) [`d8eb3e4`](https://github.com/hamedniroomand/edgefit/commit/d8eb3e45ebe85f7a385244b7ce8c36c5bad78842) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - `--built` takes Netlify framework output. `edgefit check --target netlify-edge --built .netlify` checks the functions in `.netlify/edge-functions/manifest.json`, which SvelteKit's Netlify adapter writes with `edge: true`, and every function in `.netlify/v1/edge-functions`, the Frameworks API folder. The `netlify-edge` target finds the output on its own and adds it to the functions of the project, since Netlify deploys both. Code in a folder a framework generates, such as `.svelte-kit`, is reported under `build output` and not under `your code`.

- [#70](https://github.com/hamedniroomand/edgefit/pull/70) [`6087bde`](https://github.com/hamedniroomand/edgefit/commit/6087bde7bec74e9d57021db97800fcd955e28c8c) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - CommonJS modules are read by export name, so code the project never uses from them no longer produces findings. `exports.name = …`, `module.exports = { … }`, `module.exports = require('…')`, `Object.defineProperty(exports, …)` and the getter helpers that TypeScript and SWC emit (`_export(exports, { … })`, `_export_star`) give a module named exports. What a module takes from a `require`d module is the members it reads from it (`dep.name`, `const { name } = require('dep')`, `require('dep').name`, through `_interop_require_default` and `_interop_require_wildcard` too). A module whose exports cannot be read this way is still checked in full. A Next.js middleware that only imports `NextResponse` from `next/server` no longer reports `process.cwd` from Next's server rendering code. See [Reachability follows imported names](https://edgefit.kitdev.space/guide/limitations#reachability-follows-imported-names).

- [#78](https://github.com/hamedniroomand/edgefit/pull/78) [`d8eb3e4`](https://github.com/hamedniroomand/edgefit/commit/d8eb3e45ebe85f7a385244b7ce8c36c5bad78842) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - `--built` takes a Vercel Build Output API layout. `edgefit check --target vercel-edge --built .vercel/output` checks every Edge function in it, from the `runtime` and `entrypoint` of each `.vc-config.json`, and nothing else in that file is read. The `vercel-edge` target also finds the output on its own when the source has no entry, after the middleware and the Edge routes in the source. A note says when the output is older than the code, the lockfile or `package.json`. Findings in a bundle are mapped through the sourcemaps Next.js writes beside it, including sources written as relative paths from where it built. Turbopack's wrapper for a Node.js built-in, `e.x("node:timers", () => require("node:timers"), !0)`, and the lazy form of it, bind to the module, so a read from a module Vercel lacks is reported in the bundle, at the file that wrote it. Code in the output that no sourcemap maps to a file of the project, such as a bundler's own wrappers, is reported under `build output` and not under `your code`. This includes output that has no sourcemap at all, which was reported as `your code` before, and the search for a source that is not beside its map stops at the workspace or the repository root. A new `data/unreached.json` lists code that a package ships and a target never runs, and findings in it are guarded with the reason. It covers four uses in Next.js 16.3.8's Edge bundle, which are the only findings of a built Next.js middleware and Edge route.

### Patch Changes

- [#78](https://github.com/hamedniroomand/edgefit/pull/78) [`d8eb3e4`](https://github.com/hamedniroomand/edgefit/commit/d8eb3e45ebe85f7a385244b7ce8c36c5bad78842) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - A condition made only of literals, such as `'edge' === 'nodejs'`, `!0`, `void 0 === void 0` or `typeof 'x' === 'string'`, is a constant, and the branch it rules out is treated as removed, like a `process.env.NODE_ENV` check. On the `vercel-edge` target, the global `process.env` is allowed as a whole (`Object.keys(process.env)`, `const { FOO } = process.env`, `process.env = …`), where only `process.env.FOO` was accepted before. An import of `node:process` is reported there: only the global exists on Vercel's Edge runtime, and `node:process` is not one of the allowed modules. Other targets read the global and the module the same way, as before.

- [#76](https://github.com/hamedniroomand/edgefit/pull/76) [`15a1cf2`](https://github.com/hamedniroomand/edgefit/commit/15a1cf22cd939cd8cbde8459131b8181c4920f60) Thanks [@hamedniroomand](https://github.com/hamedniroomand)! - The settings line of a report says where the entries came from, for example `entries from wrangler.jsonc "main"`. A target that finds no entry uses another target's only when that target read it from a declaration, and Netlify Edge and Vercel Edge never do. A target left without an entry is skipped, and the report says where it looked. The run fails only when no target has an entry, and the error lists where each target looked.

## 0.5.1

The weekly probe's summary for the oldest Netlify Deno is short enough to review. The package itself does not change.

### Changed

- The probe job summary groups where a runtime and the data disagree by module, with a count, and folds the full list away. It leaves out aliases that repeat another line with the same result (`x.default.y`, `sys` for `util`, the nested `path.posix` and `path.win32` names). It has three sections: present in the data but missing at runtime (possible false passes), missing as a named export only, and unusable in the data but present at runtime. The `deno (netlify-min)` summary went from about 680 lines to 48.

## 0.5.0

Fewer false alarms, suggested fixes, Netlify Edge and Vercel Edge targets, and `edgefit package` with a compatibility table.

### Added

- Findings suggest a fix. A change of setting is worked out from the check: a finding that the `nodejs_compat` flag removes says to add it, and a module gated by a compatibility date says which date, or which flag, to use. Reviewed fixes for packages and APIs come from the new `data/suggestions.json`, each with a source link, and start with file watching and process spawning on Workers. The fix shows as a `fix:` line in the text report, as `suggestion` on each finding in the JSON report, and in the GitHub annotations and the pull request comment. See [Suggested fixes](https://edgefit.kitdev.space/contributing/suggestions) to add one.
- Code that only runs on another runtime is guarded on this one. `typeof Deno`, `typeof Bun`, `'Deno' in globalThis`, `process.versions.deno`, `process.versions.bun` and `navigator.userAgent` tests are read, in an `if`, `?:`, `&&` or guard clause and in the `else` branch, so `else if (process.versions?.bun) …` chains are followed. Everything such code uses is guarded, an API that exists and throws included.
- A `try` block whose `catch` does not throw again guards the APIs the target lacks that it uses. `await import()` counts; functions defined in the block and an `import()` nothing awaits do not.
- A helper in the same file that only returns a check (`const isDeno = () => typeof Deno !== 'undefined'`, `function hasWatch() { return !!fs.watch; }`), and a `const` that holds one, stand in for the check they hold.
- Only the exports a project imports are checked. A function that only an unused export uses, such as one `fs.watch` helper in a utility library, no longer produces a finding. Modules that are imported as a namespace, with `import()` or `require()`, or that are CommonJS are still checked in full, and so is build output. A module that runs code when it loads keeps that code and what it uses, and drops its unused exports.
- `process.env.NODE_ENV` is a constant, as in the platform's production build. The default is `production` on `workerd`, `netlify-edge` and `vercel-edge`, and not fixed on `bun`, `deno` and `deno-deploy`, which set none. The report names the value it used. A branch the comparison rules out is not checked and an `import` or `require` in it is not followed, so React's development build and its `MessageChannel` are no longer reported on a Next.js middleware. Set `env: { NODE_ENV: 'development' }` to check the development build.
- `edgefit package <spec>` checks a published package, a directory or a tarball: it installs the package with `--ignore-scripts`, then checks each `exports` subpath with every export used, per target. `--badge` writes a static SVG badge, and `checkPackage()` is in the JavaScript API.
- A package compatibility table, built weekly by the new Package table workflow from `table/packages.json`, with badges and a page in the docs, and a guide to what a pass means.
- A `netlify-edge` target checks Netlify Edge Functions against the Deno data, resolving packages with `node` as `@netlify/edge-bundler` does, with Web APIs from runtime-compat-data's `netlify` column. It reads `netlify.toml` (`[[edge_functions]]`, `build.edge_functions`) to find the entry, and takes a `netlify.configFile` option. The Deno version is the minimum `@netlify/edge-bundler` requires (2.4.2). No blocked APIs are documented, so its override layer is empty and it is left out of `compare`.
- An experimental `vercel-edge` target checks code against Vercel's Edge runtime as its documentation describes it. Vercel publishes no compatibility dump, so the Node baseline is cut down to the five documented modules (`async_hooks` as `AsyncLocalStorage` only, `events`, `buffer`, `assert`, and `util` as `promisify`, `callbackify` and `types`), `Buffer`, `process.env` and the documented Web APIs. `eval`, `WebAssembly.compile` and `new Function(string)` are reported as unsupported, and `typeof EdgeRuntime` guards are understood. It resolves packages with the `edge-light` condition, uses `middleware.ts` as the entry unless it sets `runtime: 'nodejs'`, and is left out of `compare`. Calls of the `Function` constructor with code are reported. Results describe the documentation, not production; `require` calls are not checked.
- The weekly probe checks the two new platforms. A `netlify-edge` job compares the Deno range of `@netlify/edge-bundler` and a hash of the Netlify docs sections the data rests on, and a `netlify-min` run looks up every baseline API in the oldest Deno Netlify supports. A `vercel-edge` job parses Vercel's Edge Runtime page and compares it, and the globals of `@edge-runtime/vm`, with the data. Findings join the data drift issue.
- `typeof Netlify` and `typeof EdgeRuntime` checks are understood, including `typeof EdgeRuntime !== 'string'`, the form Vercel documents: a runtime marker now has a known type, so a check against it means the runtime is there or not. `process.env.NEXT_RUNTIME` compared with `'edge'` or `'nodejs'` is a check for Vercel's Edge runtime. A target can now be several runtimes at once, so Netlify Edge Functions count as both Deno and Netlify: code behind `typeof Deno` or `typeof Netlify` is checked there, and code behind a check that Netlify is absent is not.
- The `vercel-edge` module lists now have exact members, read from `NativeModuleMap` in Next.js's edge sandbox and in `@vercel/node`'s dev server, which list them identically: `util.format`, `util.inherits` and `async_hooks.AsyncResource` are no longer false errors, and `buffer.Blob`, `events.getEventListeners` and `assert.partialDeepStrictEqual` are no longer false passes. The weekly job reads both files and reports member drift.
- On `vercel-edge`, importing a Node.js module Vercel lacks is not reported, only reading from it. Next.js replaces such a module with a stand-in that throws when it is used, so a library that imports `node:fs` and only uses it behind `process.env.NEXT_RUNTIME === 'nodejs'` no longer gets a false error on its import line. A named import counts where it is used. The weekly Vercel check also reads Next's own list of kept modules and whether the stand-in still exists.
- Sample apps: Hono as a Netlify Edge Function and as Vercel Routing Middleware, and the known-bad app on both platforms.

### Changed

- The message for a module that is not native at the project's compatibility date no longer ends with what to set. That is now the finding's `suggestion`.
- The probe no longer calls `process.default.abort` (the `default` mirror of a module hid it from the rule that keeps `process.abort` from being called), and its runner ignores rejections nothing holds.
- The GitHub Action's warning about a base commit it could not check now says to build in `install-command` when the entry is build output, and the action docs explain why the base needs its own build.

## 0.4.0

The GitHub Action installs the published package, and the text report is easier to read with pnpm.

### Changed

- The GitHub Action installs the published `edgefit` package instead of building itself, so it no longer needs pnpm or corepack. It runs the version its tag was released with, verifies the signature and provenance with `npm audit signatures`, and has new inputs `edgefit-version` and `edgefit-package`. `edgefit-version: source` keeps the old build for one release.
- The text report shows a package installed by pnpm as `node_modules/<package>/...` instead of its path in the `.pnpm` store. The JSON report and GitHub annotations keep the real file path.

## 0.3.2

The GitHub Action works outside pull requests.

### Fixed

- The GitHub Action no longer fails on events other than `pull_request`. On a `push` it compares with the commit before the push, and on a manual or scheduled run, or a push that creates a branch, every finding counts as new. Only pull requests get a comment; every event gets annotations and a job summary.

## 0.3.1

A fix for false errors on projects without `nodejs_compat`, and documentation.

### Fixed

- `const { process } = globalThis` is no longer reported as a use of `process`. Only the places the name is used count, and a use after a check such as `process !== void 0` is guarded. This removes the `node:process needs the nodejs_compat flag` error that Hono's `color.js` produced in a project without `nodejs_compat`.
- `void 0` counts as `undefined` in checks like `x !== void 0`, which is how minified code writes them.
- An API a missing `nodejs_compat` flag leaves undefined (`process`, `Buffer`, `global`, and Node modules) counts as absent, so code that checks for it first is reported as guarded instead of failing the check. An import of a Node module without the flag still fails.

### Documentation

- A [status page](https://edgefit.kitdev.space/guide/status) lists the runtime versions in the data and how current they are. The [limitations](https://edgefit.kitdev.space/guide/limitations) page now covers the age of the data, assumed settings, which build outputs are tested and more.
- The GitHub Action examples use `@v0`. It follows the newest 0.x release, and the page says how to pin an exact release or a commit SHA.

## 0.3.0

The data now describes the newest workerd, Bun and Deno, and the project keeps itself honest about it.

### Added

- `edgefit --version` and `-v` print the installed version.

### Data

- The compatibility data now describes workerd 1.20260929.1, Bun 1.4.2 and Deno 2.9.7 (it was workerd 1.20260424.1, Bun 1.3.13 and Deno 2.7.13). The workerd compatibility date is 2026-09-29. The provider's repository has no newer dumps, so the three were regenerated with its own scripts; the Node baseline is unchanged.
- Bun now implements most of `node:inspector`, `node:v8`'s heap and GC functions, `vm.measureMemory`, `worker_threads.markAsUntransferable` and `node:test`'s `mock`, so those are no longer reported as unsupported. Deno now implements the `node:test` hooks, `mock.timers`, `v8.GCProfiler`, `v8.promiseHooks`, `v8.queryObjects`, `v8.startupSnapshot`, `v8.setFlagsFromString` and several `worker_threads` functions, and has `navigator.locks`.
- workerd: `net.Server` can listen on a port the platform declares, so it is a mismatch rather than unsupported. `inspector.open`, `close`, `url` and `waitForDebugger` do nothing instead of throwing, so they are reported as mocked. `vm`, `v8` and `dns` functions that were reported as throwing still do.

### Project

- A weekly check compares the pinned data with the newest runtime releases and keeps one issue up to date with what changed. A separate workflow regenerates the runtime dumps on Linux for a data bump, and the contributing docs have a runbook for both.

## 0.2.0

Fewer false errors and less noise on real projects.

### Fewer false findings

- Usages of an API the target lacks, in code that only runs when the API exists (`if (x.y)`, `typeof x.y`, `'y' in x`, `x.y?.()`, `x.y && x.y()` and guard clauses such as `if (!x.y) throw`), are reported as guarded. They do not fail a check: the text report counts them, `--verbose` lists them, and JSON has them under `guarded`. An API that exists and throws stays a finding, whatever checks come before it.
- A value that is only tested or compared with `undefined` is no longer counted as a use, and `typeof x[key]` is a check for a member, so its computed key is no longer reported as unknown.
- `import(name)` and `require(name)` are resolved when `name` is a `const` holding a plain string, so they are no longer reported as computed. This removes the `import(<expression>)` warning Hono's `color.js` produced.
- Symbol keys (`x[Symbol.iterator]`) and the global object on its own (`export { root }` after `const root = globalThis`) are no longer reported as unknown.

### Less noise

- `unknown` warnings are folded into one line per package in the text report, with a count for each API. `--verbose` lists them in full, and the JSON report and the summary are unchanged.

### Build output

- Build output without sourcemaps is attributed to packages through its `//#region` markers, so findings in a Nitro `_libs/` chunk name the package (for example `jose`) instead of `your code`, and `ignore` rules with `package` match. Locations still point into the build output.
- An entry inside a Nitro build output (a `nitro.json` beside it) is scanned as build output without `--built`.

### Wrangler settings

- The wrangler config that `.wrangler/deploy/config.json` points to is used when present, as wrangler does. A Nitro 3 build, which writes no config in the project root, now gets its entry, compatibility date and flags without `--entry`.
- `main` is read relative to the wrangler config it is written in, so it is right for a config outside the project root.
- The report says when the compatibility date or flags were assumed from the data because there is no wrangler config (or it has no `compatibility_date`), and how to set them.
- A wrangler config without `compatibility_flags` now enables no flags, as on Workers, instead of borrowing `nodejs_compat` from the data. Node built-ins are reported as unavailable for such a project, unless its date is 2026-08-04 or later. This can add findings for projects that relied on the old fallback.

## 0.1.0

- Initial release.
