---
'edgefit': patch
---

A check that another file exports in a `const` now guards the code that imports it, like a `const` in the same file. For example, `export const isDeno = typeof globalThis.Deno !== 'undefined'` in one file, and `isDeno ? globalThis.Deno.version : null` after `import { isDeno } from './runtime.js'` in another, no longer give a false finding on Workers. The other file must export the `const` with `export const`, `export { name }` or `export { name as other }`. The importing file must import it by name, as in `import { name }` or `import { name as other }`. A file between them can pass it on with `export { name } from` or with an import that it exports again. A `let`, a `var`, a default import, a namespace import, `export *`, `require` and a function are not followed. In build output (`--built`, or an entry below a `nitro.json`), edgefit does not follow such a `const` to another file.
