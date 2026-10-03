---
'edgefit': patch
---

Do not report a write to a missing member as unsupported. `process.report.excludeNetwork = true` no longer gives an error on Bun, because the write does not throw when `process.report` exists. A write to a member of a missing object is still reported.
