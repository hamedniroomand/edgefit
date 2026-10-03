---
'edgefit': minor
---

Add `--main <subpath>` to `edgefit package`, and a `main` option to `checkPackage`. A package without a `.` entry, such as `firebase`, can name the subpath that stands for it. The result of each target then comes from that subpath, the output prints `main entry: ./app`, and the worst subpath is still named when it is worse. The JSON result has `main`, and a row of the package table can set it.
