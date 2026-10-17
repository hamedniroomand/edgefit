---
'edgefit': patch
---

A CommonJS export that uses another export through `this` now keeps that export. Before, `exports.used = local` with `exports.other = function () { return this.used(); }` lost the use of `used`. So did `this['used']()`. Then the findings for `used` were lost when the project called `lib.other()`.

`this.name` at the top level, or in an exported function, uses the export `name`. An exported function is the value of `exports.name = function …`, the function of a getter, a method of `module.exports = { … }`, or a function that `exports.name = name` names. A prototype method, a helper that the module does not export, and a function that a getter returns do not count. Any other use of `this` there, such as `const self = this`, keeps every export. A test of `this` itself, such as the `this &&` in the helpers that tsc writes, keeps no export. `this` as the first argument of `__awaiter` or `__generator`, which tsc writes for an async function, or of `name.apply(this, …)` or `name.call(this, …)`, which Babel and SWC write, keeps no export either.
