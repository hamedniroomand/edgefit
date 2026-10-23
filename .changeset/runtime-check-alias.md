---
'edgefit': patch
---

A check on the global object now works through a `const` that holds it, such as `g` in `const g = globalThis; if (typeof g.Bun !== 'undefined')`. The check limits its branch to that runtime, as `globalThis.Bun` does. Before, `edgefit` reported code that only another runtime runs. This covers the runtime checks and the checks for a global, such as `!g.FileList`. A call of `Function(code)` or `WebAssembly.instantiate(bytes)` through such a `const` is also reported on the targets that report it, such as `vercel-edge`. A `let`, a `var`, a parameter and `window` are not read as the global object.
