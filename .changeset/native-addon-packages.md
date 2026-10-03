---
'edgefit': minor
---

Report a package that loads a native addon through a loader, such as `node-gyp-build`, `bindings`, `node-pre-gyp` or a platform package with a `.node` file, as a native addon. `edgefit package sqlite3`, `bcrypt` and `better-sqlite3` now fail on workerd, netlify-edge and vercel-edge and pass on Bun and Deno. The computed `require` inside such a loader is no longer reported as `unknown`.
