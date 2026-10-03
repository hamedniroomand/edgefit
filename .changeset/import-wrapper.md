---
'edgefit': patch
---

Follow a function that only runs `import(specifier)` for its one parameter, such as `const load = specifier => import(specifier)`, when every use of it is a call with a literal. Each call is read as an import of the literal, and the module is added to the graph. A function that is exported, passed on, or called with anything else is still reported as `import(<expression>)`.
