---
'edgefit': patch
---

`edgefit check` no longer takes a destructured name as an option that your code sets. A line such as `const { http2 } = env` or `function f({ http2 }) {}` only reads the name. Before, such a line made a guarded finding an ordinary finding, for example `node:tls.connect` of `got` on workerd, although the project never passed `http2: true`. Now that finding stays guarded.
