---
'edgefit': patch
---

The code of a signal handler, such as `process.on('SIGTERM', () => { … })`, is no longer guarded on Netlify Edge Functions. edgefit guarded it on Workers, Netlify Edge Functions and Vercel Edge. It cannot show that the handler never runs on Netlify, because Netlify Edge Functions run Deno, and on Deno a real SIGTERM calls the handler. So a finding in the handler, such as a file write (which fails outside `/tmp`), stays a finding. A project that passed on Netlify Edge Functions can now fail because of a handler. Ignore such a finding with a reason when the handler never runs on your function. The guard stays on Workers and Vercel Edge.
