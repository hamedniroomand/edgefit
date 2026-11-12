---
'edgefit': patch
---

A CommonJS function with the name of a compiler helper, such as `__importStar`, could hide a use. When the function used `module`, `exports` or `eval`, as in `return module.exports`, edgefit still read the exports of the module by name. Then it did not report an export that code used through that function. edgefit now checks such a module as a whole, the same as for a function with any other name. The helpers that `tsc` and SWC write get the module as a parameter, so their result does not change.
