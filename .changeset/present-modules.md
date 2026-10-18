---
'edgefit': patch
---

An import of these modules no longer gives an `unknown` warning. On Cloudflare Workers: `node:cluster`, `domain`, `inspector`, `punycode`, `repl`, `tty`, `v8`, `vm`, `wasi` and `worker_threads`. On Bun: `node:cluster`, `domain`, `inspector`, `v8` and `wasi`. A run on workerd 1.20260929.1 with `nodejs_compat` and on Bun 1.4.2 showed that they load. The data does not measure the members. A member that no other entry covers stays `unknown`.
