---
'edgefit': patch
---

Treat `fs.F_OK` as supported on Deno. The member is missing there, but `fs.access` takes an undefined mode as `F_OK`, so `fs.access(path, fs.F_OK, callback)` works the same. `fs.R_OK`, `fs.W_OK` and `fs.X_OK` are still reported, because an undefined mode checks only that the file exists. The data has a new field, `missingHarmless`, for an API that is missing on purpose, so the weekly runtime probe does not report it as stale.
