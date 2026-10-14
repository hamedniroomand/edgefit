---
'edgefit': patch
---

The value of a store such as `globalThis.fetch ??= value` does not run on a target that has the global. Each API in the value is now guarded on that target, also in a local function that only the store names. Before, only a module that the store keeps was guarded.
