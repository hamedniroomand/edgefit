---
'edgefit': patch
---

A value stored by nested polyfill stores, as in `globalThis.crypto ??= { x: (globalThis.Bun ??= value) }`, is guarded on a target that has any of the globals. Before, only the innermost store counted.
