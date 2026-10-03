---
'edgefit': patch
---

Guard an API that exists and throws inside a `try` block whose `catch` does not throw again. A promise that nothing awaits is still reported, and a check such as `if (x.y)` still does not protect an API that exists and throws.
