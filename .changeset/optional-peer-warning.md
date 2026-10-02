---
'edgefit': patch
---

An optional peer dependency that is not installed no longer makes a package `?`. When an import fails and the importing package lists the module in `peerDependenciesMeta` as optional, edgefit leaves the module out and reports an `unknown` warning that names it. Other imports that fail still give `?`.
