---
'edgefit': patch
---

A guard clause at the top level of a `try` block now protects the code after the `try` statement, when the `catch` has a `return`, `throw`, `break` or `continue` at its top level. `try { if (!globalThis.FileList) return false; } catch (_) { return false; } return globalThis.FileList.prototype;` gave an error for `FileList` on Workers. Now it gives none, as it did when the clause was before the `try`. The clause protects nothing after the `try` when the `catch` has no such jump, or when the `try` has a `finally` block.
