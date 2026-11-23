---
'edgefit': patch
---

Code after a call that always throws on the target, in a `try` whose `catch` does not throw again, is now guarded on that target: the `catch` takes over at the call, so the code never runs. This removes the false error that `@sentry/node`'s import hook gave on workerd for `Module.prototype._compile`, after `module.registerHooks`, which throws there.
