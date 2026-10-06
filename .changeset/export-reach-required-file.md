---
'edgefit': patch
---

List a finding under the export whose code loads its file, when only that export loads it. A file that an export requires inside a function, and the files that it imports, are no longer counted for the other exports. A file that a module requires at the top level still counts for every export, because it runs when the module loads.
