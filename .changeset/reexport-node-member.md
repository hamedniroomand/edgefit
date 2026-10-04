---
'edgefit': patch
---

Follow a re-export of a Node.js module. `export { promises as fsp } from 'node:fs'` is `node:fs.promises` under `fsp`. `export * as fs from 'node:fs'` is the module under `fs`.
