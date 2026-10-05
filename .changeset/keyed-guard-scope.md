---
'edgefit': patch
---

A check of a computed key guards only a read through the name that the same scope declares. A key that a nested function writes, and a `var` with the name of a parameter or of a function, stay unknown.
