---
'edgefit': patch
---

Treat a `var` or `let` that holds a guard expression like a `const` when its block does not set the name again, so patterns such as `var ok = typeof FileReader !== 'undefined'` guard later uses.
