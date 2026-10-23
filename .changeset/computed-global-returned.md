---
'edgefit': patch
---

A computed read of the global object that a function only returns, as in `return globalThis[name]`, is no longer an `unknown` finding. Before, `edgefit package @clerk/backend` reported it for `./webhooks` on workerd, bun and deno. A read that the function uses in any other way, such as a call or a `new`, is still reported. edgefit does not follow the returned value into the code that calls the function.
