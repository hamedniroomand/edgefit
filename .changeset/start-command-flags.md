---
'edgefit': patch
---

The entry that edgefit reads from a start command is no longer the value of a flag. In `bun --preload ./setup.ts src/index.ts`, the entry is now `src/index.ts`, not `setup.ts`. The same applies to the other flags that take a value in the next word, such as `--require` and `--env-file` for Bun, and `--config` and `--import-map` for Deno.
