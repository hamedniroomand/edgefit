---
'edgefit': patch
---

Read a member in any place of an `&&` or `||` chain as a check when the chain only decides an `if`, a loop, a `?:` test or a `!`. `if (a && globalThis.BroadcastChannel && b)` no longer reports `BroadcastChannel` on its own line.
