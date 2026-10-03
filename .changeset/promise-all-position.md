---
'edgefit': minor
---

Bind the names of `const [a, b] = await Promise.all([x, y])` by position, when an element is a module that edgefit tracks: a Node.js module, `import()` of one, or a call of a function that only imports its argument. The name, or an object pattern such as `{ default: fs }`, then counts the members that the code reads on it. A spread or a hole in the list, a rest element, and an element that is not a module leave the names after them unbound. `edgefit package elysia` gives ✓ on workerd, Bun and Deno. A call of a function that only imports its argument also binds a name that holds its result, as in `const fs = await load('node:fs')`.
