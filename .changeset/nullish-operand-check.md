---
'edgefit': patch
---

Read an operand of `||` or `??` as a check for an API, as in `util.getCallSites ?? util.getCallSite`. An API that the target lacks gives no finding there, and an API that exists and throws still does. A value that is called in place, such as `(x.y || z)()`, and the right operand of an expression whose left operand is not an API are still uses.
