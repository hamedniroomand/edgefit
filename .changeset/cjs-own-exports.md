---
'edgefit': patch
---

Read more CommonJS modules by export. Code that reads `module.exports.name` uses that export, a top-level `module.exports.name.key = value` counts with that export, `module.exports = function` and `= class` are read, and a class method with a computed name such as `[kName]` does not make the class run on load. These modules no longer count in full, so a finding that only some exports reach is listed under them, such as `node:console.Console` of `undici` under `MockAgent`.
