---
'edgefit': patch
---

A CommonJS module can set `exports.__esModule` or call `Object.defineProperty(exports, '__esModule', …)` to show that it was compiled from ES modules. edgefit now accepts only a value that it can find without running code and that is true, such as `true`, `1`, `'yes'` or `!0`, or `{ value: <such a value> }`. A value such as `false`, `0`, a name or a getter no longer counts. A default import of such a module now uses every export, the same as for a module without the mark. Before this change, any value counted, and a default import used only `exports.default`, which such a module usually does not set.
