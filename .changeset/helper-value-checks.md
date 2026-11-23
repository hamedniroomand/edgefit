---
'edgefit': patch
---

A helper that returns a string behind each check, such as `getDetectedPlatform()` returning `'deno'` after `typeof Deno !== 'undefined'` in `openai` and `@anthropic-ai/sdk`, now guards a comparison of its result with that string, also through a `const` that holds the call. A `static` method of a local class that returns a check, such as `Monitor.isAvailable()`, now guards like a plain helper.
