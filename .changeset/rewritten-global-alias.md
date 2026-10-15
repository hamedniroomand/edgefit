---
'edgefit': patch
---

edgefit no longer reports `g.document.body` as the global `document.body` after `let g = globalThis; g = {}`. The alias of the global object now ends when a statement directly in its scope writes a plain value to it, and all other code in that scope only reads members of `g`. At the top level of a file, this applies only in a file with an `export default` of a value, an exported value or `export *`. Code outside a script can write its top-level names, and a compiler can remove an import or an export of names that holds only types. A plain value is one of these:

- a literal, but not a regular expression
- a template
- an object literal with plain keys, whose values are such literals or templates

The alias stays in these cases:

- The value is not a plain value, for example an array, a nested object or `{} as any`.
- Code uses `g` in another way, such as a second write, a call argument, a spread or `typeof`.
- Code reads `g` with a computed key that is not a fixed string, or with a key such as `constructor` or `__proto__` that reaches the prototype.
- The scope uses `eval` or `with`.
- The write is not directly in the scope that declares `g`.
- A function declaration comes after the write in the same scope.
- The name is a parameter, a top-level `var`, an exported name, or a top-level name of any other file.
