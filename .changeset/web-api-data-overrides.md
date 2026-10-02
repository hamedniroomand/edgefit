---
'edgefit': patch
---

Stop reporting Web APIs and `process` members as missing on Bun, Deno and workerd when the runtime has them, such as `AbortSignal.any` on Bun. The probe now also looks up the Web APIs that the data marks missing.
