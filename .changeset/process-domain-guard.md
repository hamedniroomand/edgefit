---
'edgefit': patch
---

Guard the `domain` module behind a truthy read of `process.domain`, which only that module sets, so code such as `asap` that loads `domain` only when `process.domain` is set gives no `unknown node:domain` warning.
