---
'edgefit': patch
---

A read of a DOM global that the target lacks is now a finding when the code reads its plain name as the module loads. `new DOMParser()` or `Node.ELEMENT_NODE` at the top of a module is an error. There are about 640 names, such as `DOMParser`, `Node` and `XMLSerializer`. Each target has its own list of the names that it has: `localStorage.getItem('key')` is an error on Workers, Bun and Vercel Edge, but not on Deno or Netlify Edge Functions. Before, only a few names had this rule, and only on Workers and Netlify Edge Functions. Now `typeof window` and `typeof document` also guard the code behind them on Bun, Deno, Deno Deploy and Vercel Edge. A read in a function, a branch or a `typeof` check, and a read through `globalThis`, is not reported. A check such as `typeof AudioContext === 'undefined'` now guards the code after it on a target that lacks `AudioContext`. So `edgefit package firebase` no longer reports `URL.createObjectURL` for `./ai` on Workers.
