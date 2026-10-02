---
'edgefit': minor
---

A CommonJS module that requires another module through a compiler helper now asks that module only for the members it reads. The helpers are the members of `@swc/helpers`, the `__importDefault`, `__importStar` and `__exportStar` that `tsc` defines, and the same helpers of `tslib`. Any other wrapper still asks for all of the module.
