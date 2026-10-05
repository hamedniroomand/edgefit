---
'edgefit': patch
---

Read a destructuring assignment from `import()` or `require()` as a load of those names. A `catch` that throws again only when `error.code` is not the code of a missing module guards the load of that module. On a target that lacks the whole module, it also guards the members that the rest of the `try` block reads.
