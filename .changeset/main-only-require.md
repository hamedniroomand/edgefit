---
'edgefit': patch
---

Leave a module out of the graph when only a `require()` behind `require.main === module` loads it, in a file that is not an entry. A package that keeps its CLI in a separate file no longer gets findings from that file.
