---
'edgefit': patch
---

Report the `process.report.excludeNetwork` read of `better-sqlite3` 13.2.0 as guarded on Bun: its libc check returns before it reaches `process.report` there.
