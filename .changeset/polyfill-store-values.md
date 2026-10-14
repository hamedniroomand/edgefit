---
'edgefit': patch
---

The value of a polyfill store such as `globalThis.fetch ??= value` does not run on a target that has the global and whose data marks it as supported. Each API and native addon in the value is now guarded on that target, also in a local function that only the store names. Before, only a module that the store keeps was guarded. A store to `globalThis.process` with `??=`, `||=` or an assignment after a check now counts too. A check for `process`, such as `typeof process` or `globalThis.process`, now uses the same data as a read of `process`. So on Workers with `nodejs_compat` off, the check says that `process` is missing. A store through a `let` or `var` alias of the global object, such as `let g = globalThis`, no longer counts. The right side of `a ?? b` now gets the same checks as the right side of `a || b`.
