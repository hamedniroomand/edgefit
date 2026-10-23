---
'edgefit': patch
---

A function that a call such as `page.evaluate(() => …)` sends to a browser page runs in the page, not on the runtime that makes the call. edgefit now guards every usage in that function. This covers a function expression or an arrow function that is the first argument of a call of a method named `evaluate`, `evaluateHandle` or `evaluateOnNewDocument`. Before, the APIs that the function uses were findings, including errors such as `child_process.spawn` on Workers and the `unknown` warning for a computed read such as `globalThis[name]`. The report lists them as guarded usages, and `--verbose` shows them. The call itself, its other arguments and a function that the call names stay findings.
