---
'edgefit': patch
---

List the findings of each entry and target in `edgefit package --format json`. The new `findings` field holds the findings that `errors` and `warnings` count, with the same fields as the findings under `exports`, so a tool can read what failed and not only how many findings there are.
