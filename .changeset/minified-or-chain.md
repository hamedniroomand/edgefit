---
'edgefit': patch
---

edgefit now reads the minified form of `globalThis.Deno?.core.print("x");` as its source. For ES2019 or older, esbuild writes `var o;(o=globalThis.Deno)==null||o.core.print("x");` when it minifies. When this statement stands alone, a target without `Deno`, such as workerd, now shows no finding. Before, edgefit reported `Deno.core.print` as an error there. As an item of a list joined with commas, on the right side of `&&`, `||` or `??`, and in a branch of `?:`, edgefit also reads the form as its source when nothing reads its value, so the result there is the result of the source form. A strict compare alone, as in `(o=x)===null||o.y`, is not read as a chain, because it lets `undefined` through.
