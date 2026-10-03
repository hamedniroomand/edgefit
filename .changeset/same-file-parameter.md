---
'edgefit': minor
---

Read a module that is passed to a function of the same file as the members that the function reads on that parameter. `print(process.stderr)` with `stream.write()` inside `print` is a use of `process.stderr.write` and no longer an `unknown` access. The same goes for a module in an object literal that is passed that way. A parameter that the function stores, returns, passes on or sets keeps the `unknown`.
