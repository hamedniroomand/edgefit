---
'edgefit': patch
---

Read a conditional of the global object, such as `typeof window !== 'undefined' ? window : globalThis`, as an alias of the global object. A member check through the alias now guards the same global.
