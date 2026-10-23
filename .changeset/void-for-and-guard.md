---
'edgefit': patch
---

A use after a `?.` right behind a property of the global object is now guarded in more places. These places are the operand of `void`, and the init and the update of a `for` loop. The right side of an `&&` counts too, when the `&&` goes into a check, as in `if (n && globalThis.Deno?.core.read())`. A target without that global shows no finding for them, as for a statement of its own. Before, edgefit reported `Deno.core.read` as an error on workerd for `void globalThis.Deno?.core.read()` and for `if (n && globalThis.Deno?.core.read()) h()`. A minifier writes the second form as `n&&globalThis.Deno?.core.read()&&h()`.
