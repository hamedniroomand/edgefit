---
'edgefit': patch
---

Follow a Node.js module that one file exports under a name and another file of the graph imports by that name. `crypto.createHash()` in the importing file counts as a use of `node:crypto`, and the export is no longer reported as `unknown`. The export stays `unknown` when nothing imports the name, when a file imports the whole file, or when it is re-exported again.
