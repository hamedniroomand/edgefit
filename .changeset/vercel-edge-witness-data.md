---
'edgefit': minor
---

The `vercel-edge` target now uses what edgefit measured on Vercel, as middleware and as an edge function. `DOMException`, `WeakRef` and `FinalizationRegistry` are reported as missing, because edge functions lack them, and `async_hooks.AsyncResource` is reported as missing, because middleware lacks it. Each note names the one that has the API. Next.js's own use of `WeakRef` is reported as guarded, because Next.js checks for `FinalizationRegistry` first.
