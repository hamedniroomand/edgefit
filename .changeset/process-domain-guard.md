---
'edgefit': patch
---

Guard the `domain` module behind a truthy read of `process.domain`, or a comparison that rules out `null`, because only that module sets the value, so code such as `asap` that loads `domain` only when `process.domain` is set gives no `unknown node:domain` warning.
