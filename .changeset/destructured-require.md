---
'edgefit': patch
---

Count a name that a file destructures from a Node.js module, as in `const { Console } = require('node:console')`, where the name is used and not where it is destructured. A name that is never used is not a finding. This moves the finding to the code that uses the name, and to the exports that reach it.
