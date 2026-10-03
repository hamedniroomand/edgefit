---
'edgefit': minor
---

Follow a file that another file loads with `const x = require('./file')` or `const x = await import('./file')` and only reads by member, as in `x.crypto.randomBytes(8)`. The module that the file exports under `crypto` is that module in the file that reads it, and the export is no longer `unknown`. This is the form that `tsc` writes for CommonJS. A name that is passed on, stored, written to or read with a computed key keeps the `unknown`. `edgefit package @anthropic-ai/sdk` gives ✓ on Bun and Deno for `./client.js`, `./index.js` and `./resources.js`.
