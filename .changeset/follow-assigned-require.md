---
'edgefit': patch
---

Follow a variable that is declared without a value and set once to a required module, such as `let c; c = require('node:crypto')`. Its members now count as uses of the module, and no `unknown` warning shows.
