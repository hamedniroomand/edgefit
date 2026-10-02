---
'edgefit': patch
---

Stop reporting a constant value of a Node module as mocked on `workerd` when the unenv polyfill provides it, such as `EOL` from `node:os`. Functions and classes are still reported.
