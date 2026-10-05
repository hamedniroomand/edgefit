---
'edgefit': patch
---

Read a computed key that is a parameter of a function of the file, when every call passes a known string, and a member of each object of a known list. Treat `x = obj[key]` followed by `if (typeof x !== 'function') x = fallback` as a check, like `obj[key] || fallback`. This clears the `unknown console[<expression>]` warning for `@opentelemetry/api`.
