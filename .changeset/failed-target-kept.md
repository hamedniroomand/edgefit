---
'edgefit': minor
---

Keep a resolve error with the target whose module graph failed, and check the other targets. Before, one target that could not resolve a module, such as `workerd` for `@node-rs/argon2` whose `browser` field selects a file that imports a module that is not installed, stopped the whole run, and Bun and Deno got no result. `check()` now returns `failed` for that target, `edgefit check` prints the other reports and then the error, `compare` shows a column for it, and the exit code is 2. `edgefit package` shows the cell of that target as not checked or as an error, and the other targets keep their result. When every target fails, the first error is still thrown.
