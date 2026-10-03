---
'edgefit': minor
---

Follow a variable that is set to a module in a `try` and to a literal, an object, an array or a template in the `catch`, as in `let http2; try { http2 = require('node:http2') } catch { http2 = { constants: {} } }`. The fallback is no longer a second write. A second write that may hold a module, such as `m = other ? require('b') : null`, still is. `edgefit package cheerio` gives ✓ on Bun and Deno.
