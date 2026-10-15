---
'edgefit': patch
---

A write through a TypeScript wrapper, as in `(a as any) = value`, `a! = value`, `(a)! = value`, `(a as any)++` or `for ((a as any) of list)`, now ends a check on `a`. Before, edgefit did not see such a write. A `let` or `var` that holds a check was still followed, and a test such as `if (a.watch)` still guarded the code after the write, so a finding could be hidden.
