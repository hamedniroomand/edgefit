---
'edgefit': patch
---

A runtime check through a `const` that holds `typeof window !== 'undefined' ? window : globalThis`, such as `typeof root.Bun !== 'undefined'`, now limits its branch to that runtime, the same as a check of an API through that `const` already guarded.
