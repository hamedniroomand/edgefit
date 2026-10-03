---
'edgefit': minor
---

List the findings that only some exports of a package entry reach under those exports, and do not count them in the status of the entry. `edgefit package mysql2` now passes on Workers, with `createServer` named with its `mismatch node:net.createServer`, because only that export needs a port that a Worker cannot open. The package result has `exports` for each entry and `worstExport` for each target, `edgefit package` prints a line for each export and the worst export, and the package table shows the worst export as a third mark and in the row detail. `check` takes the option `byExport`, which sets `Finding.exports`. The result version stays 2, since the fields are new.
