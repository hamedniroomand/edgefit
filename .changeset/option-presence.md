---
'edgefit': patch
---

Change how an option before a spread counts. A spread of a known object literal removes only the keys that it holds, and only when it may give `undefined` for them, as in `...(check && { checkServerIdentity })`. Any other spread after an option removes it, except a spread of a known falsy value such as `...null`, which adds and removes no keys. A spread with a known falsy condition spreads no keys, and a spread with a known truthy condition always spreads. `Object.assign`, `Object.defineProperty` and similar calls on the object now stop edgefit from reading its keys.
