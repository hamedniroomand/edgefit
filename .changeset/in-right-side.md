---
'edgefit': patch
---

`'k' in x.y` and `'k' in x?.y` now count as a use of `x.y`, so edgefit reports `x.y` when the target lacks it. They are still a check for `x.y.k`. `'X' in globalThis` is still only a check. A use of an API that the data does not cover, outside a check, is now an `unknown` warning also when the code uses a member of it after a check. The module itself, such as its import, is still not reported then.
