---
'edgefit': minor
---

The `netlify-edge` target now uses what edgefit measured on Netlify. Netlify runs Deno 2.3.1, so the report names that version. `child_process` and the `fs` write APIs are now errors, because Netlify blocks subprocesses and grants write access to `/tmp` only. APIs that Deno 2.3.1 has and later Deno releases removed, such as `util.isString`, are no longer reported.
