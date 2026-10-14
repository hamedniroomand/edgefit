---
'edgefit': patch
---

A check of `NaN` or `undefined`, by its bare name or through the global object, no longer guards code that runs when the check sees the value as missing. These globals exist, but `NaN` is falsy, and `undefined` is also nullish and has the type `undefined`. So the value of `globalThis.NaN ||= value`, and the code in `if (!globalThis.NaN)`, are now checked. This holds for `||`, `??`, `?:`, `&&`, `else` and a guard clause too. `globalThis.NaN ??= value`, `globalThis.NaN ?? value` and `typeof globalThis.NaN === 'undefined'` stay guarded.
