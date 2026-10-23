---
'edgefit': patch
---

A use after a `?.` right behind a property of the global object is now guarded in more places where nothing reads the value. These places are an item of a list joined with commas, the right side of `&&`, `||` or `??`, a branch of `?:`, and a call with `await` before it. A target without that global shows no finding for them, as for a statement of its own. Before, `if (n) globalThis.Deno?.core.print('x')` was guarded. A minifier writes it as `n&&globalThis.Deno?.core.print("x")`, and edgefit reported `Deno.core.print` as an error on workerd for that form.
