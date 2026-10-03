---
'edgefit': patch
---

Cover `postal-mime` 4.0.3 and 4.0.4 in the list of code that a package ships and a target does not run. The `FileReader` finding of `blobToArrayBuffer` is guarded on workerd and Bun for these releases, as it is for 4.0.2.
