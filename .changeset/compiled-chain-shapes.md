---
'edgefit': patch
---

edgefit now reads four more compiled forms as their source, for ES2019 or older. The forms are a chain that goes on behind a call (`x.y?.z()?.w` and `x.y?.z?.()`), the minified statement `x.y ?? z()`, the flat `n != null || (_a = x.y) == null || _a.z` that a minifier writes for `n ?? x.y?.z`, and `delete x.y?.z`. The two `??` forms are read where nothing reads their value. Before, edgefit reported `Deno.core.print` as an error on a target without `Deno`, such as workerd, for `globalThis.Deno?.core.print('x')?.then(f)` and for the minified `globalThis.Deno?.core.print('x') ?? y()`. It reported `Deno` and `Deno.core` for `delete globalThis.Deno?.core`. The source forms gave no finding.
