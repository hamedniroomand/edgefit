---
'edgefit': patch
---

A local class that only checked code makes, as in `typeof window !== 'undefined' ? new BrowserMonitor() : new NoopMonitor()`, now gives the check to its constructor, instance methods and instance fields, as a local function that only checked code calls does.
