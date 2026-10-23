---
'edgefit': patch
---

A use after a `?.` right behind a property of the global object is now guarded, as in `globalThis.Deno?.env.toObject()`. A target without that global shows no finding when the value of the chain goes into a check, an operand of `||` or `??`, or a statement of its own. Before, `edgefit package better-auth` reported `Deno.env.toObject` as an error on workerd for 45 of its 57 subpaths.
