---
'edgefit': patch
---

Report `node:tls.connect` and `node:tls.TLSSocket` on workerd as `mismatch` when a call passes an option that workerd rejects. Examples are `ALPNProtocols` and `rejectUnauthorized: false`. `undici` passes `ALPNProtocols` on each HTTPS request. A call that passes none of these options gets no finding. For `checkServerIdentity`, the finding follows your compatibility date and flags. Report `node:tls.getCiphers` as `unsupported` on workerd, because it throws.
