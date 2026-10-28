---
'edgefit': patch
---

Add `next` 16.4.3 to the data for code that a target never runs. For example, `edgefit check --built .vercel/output` on a Next.js app built with `next` 16.4.3 no longer fails on `node:process.hrtime.bigint`, `setImmediate` and `WeakRef` on vercel-edge.
