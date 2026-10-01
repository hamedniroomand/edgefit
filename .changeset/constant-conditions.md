---
'edgefit': patch
---

A condition made only of literals, such as `'edge' === 'nodejs'`, `!0`, `void 0 === void 0` or `typeof 'x' === 'string'`, is a constant, and the branch it rules out is treated as removed, like a `process.env.NODE_ENV` check. On the `vercel-edge` target, `process.env` used on its own (`Object.keys(process.env)`, `const { FOO } = process.env`, `process.env = …`) is no longer reported as missing: only `process.env.FOO` was accepted before.
