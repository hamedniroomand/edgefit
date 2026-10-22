---
'edgefit': patch
---

`edgefit package <directory>` no longer runs the `prepare` script of the package. npm 10, the version of Node 22, runs that script in `npm pack` although edgefit passes `--ignore-scripts`. edgefit now packs a copy of the directory without that script, so build the package before you check it.
