---
'edgefit': patch
---

edgefit scans a large bundled file much faster. The scan for import wrappers and loader objects copied a list for each mention of a name, and it searched all calls for each function. A file that repeats a name many times took quadratic time. One example is the 4 MB Sentry CLI bundle that the `@sentry/node` subpaths `./vite`, `./rollup`, `./webpack` and `./esbuild` reach. `edgefit package @sentry/node` takes about half the time. The findings do not change.
