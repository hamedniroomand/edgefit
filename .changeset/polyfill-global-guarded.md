---
'edgefit': patch
---

A Node.js module that code stores in a global the target already has, such as `globalThis.crypto ??= crypto`, no longer gives an `unknown` warning. The store only runs when the global is missing, so edgefit lists it as guarded. The forms are `??=`, `||=`, and an assignment after a check such as `if (!globalThis.crypto)`. The warning stays on a target that lacks the global.
