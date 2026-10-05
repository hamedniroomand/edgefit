---
'edgefit': patch
---

Do not report a computed read as `unknown` when its key comes from a list that a `.filter(name => name in obj)` made, and the loop reads `obj[name]`. This clears the `unknown global[<expression>]` warning for `jsdom` on Bun and Deno.
