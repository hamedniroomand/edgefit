---
'edgefit': patch
---

Do not report a computed access of a global as unknown when the code writes it, as in `globalThis[key] = value`, or reads it with a fallback, as in `globalThis[key] || Fallback`. Neither form needs an API that the target lacks.
