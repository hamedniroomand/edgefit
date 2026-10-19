---
'edgefit': patch
---

Report `worker_threads.locks` on Bun, which does not exist there. On Deno, report `test.run`, which does not run tests, `worker_threads.parentPort.emit` and `removeAllListeners`, which throw, and `v8.startCpuProfile` and `worker_threads.parentPort.close`, `dispatchEvent`, `hasRef` and `start`, which do not exist. Before, a use of these members gave no finding, because the data marked the whole module as supported. On Deno, a `node:worker_threads` module object or its `parentPort` that is passed on as a value now also gives an `unknown` warning.
