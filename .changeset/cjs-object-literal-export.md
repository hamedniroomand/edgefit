---
'edgefit': minor
---

Read `exports.name = { … }` as the export `name`. The functions and methods in the object count once the export is used. Any other value in it, such as a call, a member read or a spread, counts when the module loads. A CommonJS module with such an export, such as `credentials` in `@grpc/grpc-js`, can now be traced, so the exports that nothing uses are left out of the check.
