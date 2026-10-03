---
'edgefit': patch
---

List the `FileReader` fallback of `postal-mime` as code that `workerd` and Bun never reach. Both have `Blob.prototype.arrayBuffer`, which the function checks first, so the finding is reported as guarded.
