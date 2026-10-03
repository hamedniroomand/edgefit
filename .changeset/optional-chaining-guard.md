---
'edgefit': patch
---

Read optional chaining as a check. `a?.b` and `a?.b?.()` no longer use `b`, and an `if` that tests them guards its branch. A guarded use of an API that the data does not cover is listed as guarded, not as an `unknown` warning.
