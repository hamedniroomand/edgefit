---
'edgefit': patch
---

A read with `?.` is now a use in these places, because each one throws for `undefined`: `new (x?.y)()`, `class extends (x?.y)`, a tag, the right side of `instanceof`, destructuring and a destructured default, a spread into an array or a call, `for…of` and `yield*`. Before, edgefit read `?.` there as a check, so `new (globalThis.Deno?.Command)()` gave no finding on Workers, although it throws. A destructured default such as `const { b: { a } = x.y } = o` can now also give an `unknown` warning for `x.y`, as a destructured parameter default already did.
