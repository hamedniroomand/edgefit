---
'edgefit': patch
---

A condition made only of literals, such as `'edge' === 'nodejs'`, `!0`, `void 0 === void 0` or `typeof 'x' === 'string'`, is a constant, and the branch it rules out is treated as removed, like a `process.env.NODE_ENV` check. On the `vercel-edge` target, the global `process.env` is allowed as a whole (`Object.keys(process.env)`, `const { FOO } = process.env`, `process.env = …`), where only `process.env.FOO` was accepted before. An import of `node:process` is reported there: only the global exists on Vercel's Edge runtime, and `node:process` is not one of the allowed modules. Other targets read the global and the module the same way, as before.
