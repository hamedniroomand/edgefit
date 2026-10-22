---
'edgefit': patch
---

Hide the `node:tls.connect` warning of `got` 16.1.0 on workerd in a project that does not set `http2`. `got` reaches it only when a project sets the `http2` option, which is off by default. `edgefit package got` now shows ✓ on workerd.
