---
'edgefit': patch
---

Read a call through a sequence expression, such as `(0, ns.member)()` in `tsc` output, as a call of the member. A module that the call reaches through `__importDefault` is no longer reported as passed on as a value.
