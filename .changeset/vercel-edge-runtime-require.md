---
'edgefit': minor
---

Report `require(<expression>)` as an error on `vercel-edge`. Vercel bundles a static `require`, but a `require` whose module is computed at runtime cannot work there. It stays an `unknown` warning on the other targets, and inside `try`.
