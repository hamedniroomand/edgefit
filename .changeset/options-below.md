---
'edgefit': patch
---

A computed read such as `obj[key]` no longer gives an `unknown` finding when the only problems below `obj` are APIs that fail only for some options, or APIs that the generated data lists as missing or as a different type but the curated data marks as supported. For example, `globalThis.ReadableStream[key]` on workerd and bun, `globalThis.caches[key]` on deno and netlify-edge, and `http2.constants[key]` on netlify-edge.
