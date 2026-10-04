---
'edgefit': minor
---

Read `module.exports = name` as the whole export of a CommonJS file when `name` holds a Node.js module, as `protobufjs` and `@protobufjs/fetch` write it with `var fs = null; try { fs = require('fs') } catch {}`. A file that binds the result of `require()` to a name, or destructures it, gets the members it reads as uses of the module, with its own guards. When every file that loads it does so, the module is no longer reported as `unknown` in the exporting file. `data/stored-modules.json` lists the one case that no rule follows: `protobufjs` stores the module in a property of another export object and reads it in a third file. `firebase/firestore` on Deno no longer has the two `unknown node:fs` warnings.
