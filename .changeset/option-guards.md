---
'edgefit': patch
---

Guard a finding in code that runs only when the project sets an option of the package, such as `if (options.http2)` in `fastify`. The finding is listed with `--verbose` and does not fail the check, unless a file of the graph sets the option. This clears the `node:http2` errors of `fastify` on workerd.
