---
'edgefit': patch
---

The code in a signal handler is now a guarded usage on Workers, Netlify Edge Functions and Vercel Edge, where no signal arrives. A handler is the function in `process.on`, `process.once` or `process.addListener` with an event such as `'SIGTERM'`. It can also be a local function that only these calls and `process.off` or `process.removeListener` use. Before, `process.kill(process.pid, 'SIGTERM')` in a `SIGTERM` handler was an error on Workers. Now the report lists it as a guarded usage. On Vercel Edge, `process.on` itself stays an error. The findings stay on Bun, Deno and Deno Deploy.
