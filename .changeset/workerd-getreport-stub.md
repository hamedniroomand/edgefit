---
'edgefit': patch
---

Report `process.report.getReport` on Cloudflare Workers as a `mismatch`. workerd returns an empty object, so code that reads a field of the report, such as `header.glibcVersionRuntime` in `better-sqlite3`, fails on Workers.
