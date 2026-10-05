---
'edgefit': patch
---

Read a computed key that is a string `const` which another file of the graph exports, also through a re-export of the name. A package that keeps its keys in a separate file, such as `effect`, no longer gets `unknown globalThis[<expression>]` for a read.
