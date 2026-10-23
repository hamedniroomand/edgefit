---
'edgefit': patch
---

List `addPageBinding` of `puppeteer-core` 25.16.0 as code that only runs in the browser page. `ExecutionContext#evaluate` sends the function to the page, and `pageBindingInitString` gives the page a string of it. No code of the package calls it on the target. The report lists its computed reads `globalThis[<expression>]` as guarded usages, and `--verbose` shows them. Together with the guard for page functions, `edgefit check` on a project that imports `puppeteer-core` or `puppeteer` shows no `globalThis[<expression>]` warning on workerd, Bun, Deno, Deno Deploy and Netlify Edge.
