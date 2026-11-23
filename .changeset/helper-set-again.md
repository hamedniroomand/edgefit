---
'edgefit': patch
---

A helper function declaration that the file sets again, as in `isDeno = () => true`, is no longer read as a check, as a `var` is not. A test with `typeof f < 'undefined'`, `>`, `<=` or `>=` no longer counts as a test that `f` is missing before a fallback.
