---
'edgefit': patch
---

`edgefit check` and `edgefit package` no longer report `require(<expression>)` or `import(<expression>)` as `unknown` when a `try` block catches the call and the module name is a conditional expression of strings, such as `flag ? 'hono/bun' : 'hono/deno'`. A `const` can hold the expression. The `import()` must follow `await`. A branch with `undefined`, `null` or `void 0` loads nothing. `edgefit` reads one `require` or `import` for each string, so a Node.js module that a string names is reported by name, and a test such as `typeof Deno !== 'undefined'` limits its branch to that runtime. A call that nothing catches is reported as before: `unknown`, and an error on Vercel Edge. This removes the warning for the Hono lookup in `@sentry/server-utils`, which `@sentry/cloudflare` and `@sentry/node` use.
