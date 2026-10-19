---
'edgefit': patch
---

A default import of a CommonJS module that sets `__esModule` now uses all of the module when the importing file is in node mode. Node.js and esbuild give all of `module.exports` as the default export in this mode. Before, edgefit used only the `default` export, so it could lose findings. A file is in node mode when it is `.mjs` or `.mts`. A file is also in node mode when it is not `.cjs` or `.cts` and its nearest `package.json` has `"type": "module"`, or when that `package.json` cannot be read. This also applies to `export { default } from` and to `import()`. `edgefit package` checks each entry in node mode, so a finding that only some exports of such a module reach is now also listed under `default`. An `__esModule` mark now counts only when it is on the object that the module exports at the end. A mark set before a later `module.exports = …` no longer counts.
