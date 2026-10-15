---
'edgefit': patch
---

A `?.` or `??` that a compiler wrote for ES2019 or older now gives the same findings as the source. TypeScript, Babel and esbuild write `x.y?.z` as `(_a = x.y) == null ? void 0 : _a.z` or `(_a = x.y) === null || _a === void 0 ? void 0 : _a.z`, `x.y ?? z` as `(_a = x.y) != null ? _a : z`, and a minified `if (x.y?.z)` as `(_a = x.y) != null && _a.z`. edgefit read `x.y` in these forms as a plain use, so a global that the runtime lacks, such as `Deno` on Workers, was a finding where `globalThis.Deno?.cwd` gives none.
