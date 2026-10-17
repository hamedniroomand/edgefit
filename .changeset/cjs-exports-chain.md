---
'edgefit': patch
---

Read the exports of a CommonJS module that writes them in two statements or in a chain. These forms are read:

- `module.exports.key = …` after `module.exports = name` (a function or class that the module declares and nothing else names), `= function …` or `= class …` (a class without code that runs on load). When any export of the module is used, the value and all of these exports count, because the value can reach them through `this`.
- `module.exports = exports = …` and `exports = module.exports = …`.
- `local = exports.name = function …` or `= class …` (a class without code that runs on load), with or without `const`, `let` or `var`.

These forms are not read when the module can reach its own exports through `arguments`, `caller`, or `require` in any way other than a call with a string literal, such as `require(__filename)` or `require.cache`. The chain and the `local =` forms are also not read when the module uses `this`.

Before, edgefit counted the whole module for these forms. Files in `undici` and `jsdom` use some of them. Other mixes of writes, such as `exports.name = …` after `module.exports = …`, still count the whole module.
