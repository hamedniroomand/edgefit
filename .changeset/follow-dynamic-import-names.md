---
'edgefit': patch
---

Read `const { a, b } = await import('./file')` as an import of the names `a` and `b`. The file is asked for those names only, so code that nothing uses is left out, and a Node.js module that the file exports under one of them is followed in the importing file. An `import()` that is stored whole, passed on, or destructured with a rest element or a nested pattern still takes the whole file.
