---
'edgefit': patch
---

Read the test of a `while`, `do` or `for` loop, and either side of `||` in a test, as a check, as in an `if`. `while (globalThis.Deno.core)` and `if (n || globalThis.Deno?.core.read())` no longer give a finding on a target without `Deno`.
