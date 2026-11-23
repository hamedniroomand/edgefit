---
'edgefit': patch
---

On workerd, a call of `tls.connect` or `new tls.TLSSocket` that passes an option that fails at every date and with every flag, such as `ALPNProtocols` in undici, is now an `unsupported` error in place of a `mismatch` warning. The call always throws. An option that a flag can turn off, such as `checkServerIdentity`, stays a warning. mysql2's TLS call is listed as code that runs only when a project sets the `ssl` option.
