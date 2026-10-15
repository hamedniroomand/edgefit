---
'edgefit': patch
---

A module whose function, block, loop or `catch` declares its own `exports`, such as `constructor (client, socket, { exports })` in undici, does not count as a whole only because of that name. A mention of `exports` inside that scope is a local variable. A mention outside it counts as before. This applies only to `exports`: a local `module` is not treated as a local variable.
