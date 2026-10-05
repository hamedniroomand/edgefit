---
'edgefit': patch
---

Read the `__toModule` helper of esbuild before 0.14 like `__toESM`. A package built with an old esbuild no longer gets an `unknown` warning for a module that it loads through this helper.
