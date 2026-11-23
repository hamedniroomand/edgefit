---
'edgefit': patch
---

Guard the `else` branch of a chain of checks with `&&` on a target where every check holds, such as the Emscripten test for Node.js on Workers with `nodejs_compat`.
