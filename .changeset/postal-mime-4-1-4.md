---
'edgefit': patch
---

Add `postal-mime` 4.1.4 to the data for code that a target never runs. A project that imports `postal-mime` 4.1.4 no longer gets a warning for `FileReader` on workerd and Bun, and `edgefit package postal-mime` no longer names `FileReader` as a worst export.
