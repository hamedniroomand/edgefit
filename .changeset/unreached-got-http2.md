---
'edgefit': patch
---

Hide the `node:tls.connect` warning of `got` 16.1.0 on workerd. `got` reaches it only when a project sets the `http2` option, which is off by default. edgefit also hides it in a project that sets that option. `edgefit package got` now shows ✓ on workerd.
