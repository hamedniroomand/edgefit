---
'edgefit': minor
---

The `vercel-edge` target now warns on `WebAssembly.instantiate` when its first argument is not an imported `.wasm` module, since Vercel's Edge runtime does not compile Wasm from bytes.
