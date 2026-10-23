---
'edgefit': patch
---

A read of a global that the target lacks, by its bare name, is now a finding when the read runs as the module loads. This holds for `window`, `document`, `HTMLAnchorElement`, `Deno` and `Bun` on Workers, and for `document`, `HTMLAnchorElement` and `Bun` on Netlify Edge Functions. `if (!document) throw new Error('needs a browser')` and `document.implementation.createDocument(null, null, null)` at the top of a module are errors there. Before, a bare `document` gave no finding, and `!document`, `if (document)` and `document?.x` counted as checks. Now only `typeof document` is a check for these globals. A read in a function, a branch, a loop body, a `try` statement or a `switch` case is still not reported.
