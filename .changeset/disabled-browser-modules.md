---
'edgefit': patch
---

Leave out a module that the `browser` field of a package maps to `false`. esbuild names it `(disabled):…`, and edgefit tried to open that name as a file, so `edgefit check` and `edgefit package` stopped with ENOENT on a package such as `sanitize-html`. An import of such a module now gives nothing.
