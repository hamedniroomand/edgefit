---
'edgefit': patch
---

A use of the result of `x.y?.()` that throws when the result is `undefined`, such as `const { a } = x.y?.()`, `new (x.y?.())()` or `for (const v of x.y?.())`, is now a finding, as it is without `?.`. The call alone, and a result read with `?.` or `??`, stay guarded.
