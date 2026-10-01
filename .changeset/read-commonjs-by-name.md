---
'edgefit': minor
---

CommonJS modules are read by export name, so code the project never uses from them no longer produces findings. `exports.name = …`, `module.exports = { … }`, `module.exports = require('…')`, `Object.defineProperty(exports, …)` and the getter helpers that TypeScript and SWC emit (`_export(exports, { … })`, `_export_star`) give a module named exports. What a module takes from a `require`d module is the members it reads from it (`dep.name`, `const { name } = require('dep')`, `require('dep').name`, through `_interop_require_default` and `_interop_require_wildcard` too). A module whose exports cannot be read this way is still checked in full. A Next.js middleware that only imports `NextResponse` from `next/server` no longer reports `process.cwd` from Next's server rendering code. See [Reachability follows imported names](https://edgefit.kitdev.space/guide/limitations#reachability-follows-imported-names).
