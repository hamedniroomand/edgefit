---
'edgefit': patch
---

Do not report a computed read of the global object that is only compared. `globalThis[name] === value` no longer gives an `unknown` warning. A call, a member read or a value passed on is still reported.
