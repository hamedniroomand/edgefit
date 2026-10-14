---
'edgefit': patch
---

A check now also covers a function in the same file when only checked code uses the function. Pinia uses this pattern with `typeof window`. The function gets no checks when the file exports it, sets its name again or calls `eval`. A function that only another function calls gets no checks. A function that only a polyfill store such as `globalThis.fetch ??= myFetch` names is guarded on a target that has the global.

The `workerd` data now says that `window`, `document`, `HTMLAnchorElement`, `Deno` and `Bun` are missing. The `netlify-edge` data says that `document`, `HTMLAnchorElement` and `Bun` are missing. So code behind `typeof window !== 'undefined'` is guarded on Workers. Pinia's `URL.createObjectURL` and `URL.revokeObjectURL` errors are gone on Workers.

Some uses of a missing global through the global object do not fail, so they are guarded: a test, `Boolean(globalThis.X)`, a comparison and the value of a `const`. Every other use, such as a call, `new` or a member, is a finding. edgefit does not report a browser global that the code uses by its bare name, such as `document.title`.
