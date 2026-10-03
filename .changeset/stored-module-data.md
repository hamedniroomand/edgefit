---
'edgefit': minor
---

Add `data/stored-modules.json`, a reviewed list of package files that keep a Node.js module in a lookup table and read only some members of it. A listed file counts as a use of those members, so the module is no longer reported as `unknown`. The first entry is `follow-redirects`, which `axios` uses for `node:http` and `node:https`. `edgefit package axios` now passes on Deno.
