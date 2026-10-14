---
'edgefit': patch
---

Follow a helper that tests a check in one `if` and returns `true` or `false`, such as `function isDeno() { if ('Deno' in globalThis) { return true; } return false; }`. The two returns must have different values. A helper that returns `false` when the test passes holds the opposite check. A helper with an `else` is followed too.
