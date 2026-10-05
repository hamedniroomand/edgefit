---
'edgefit': patch
---

Treat a check for a global as a known branch on a target whose data says if it has the global. Code that only runs when a global is missing, or after a guard clause for a global the target lacks, is guarded and does not fail the check.
