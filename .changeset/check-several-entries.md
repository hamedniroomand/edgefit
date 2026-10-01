---
'edgefit': minor
---

`--entry` can be given more than once, and `entry` in the config can be an array. Both accept globs, which skip `node_modules`. All entries are resolved in one build, so a module shared by two entries is scanned once and its findings are reported once. Netlify Edge checks every function without `--entry`. A target with no entry of its own uses the entries of the first target that has some, and the report notes it. The JSON report is version 2: `entry` is now `entries`. `edgefit diff` still reads a version 1 report as the base. The Action's `entry` input takes one entry per line.
