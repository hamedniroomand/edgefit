---
'edgefit': patch
---

Two code forms hid a real finding. edgefit now reports them:

- A `var` that holds a check, in a nested block, stayed a guard after a write outside the block, as in `{ var isDeno = …; var read = () => (isDeno ? Deno.version : 'none'); } isDeno = true;`. A write anywhere in the function of the `var`, or in the file at the top level, now ends the check.
- A call of `WebAssembly.compile`, `WebAssembly.compileStreaming`, `WebAssembly.instantiate`, `WebAssembly.instantiateStreaming`, `fetch`, `fs.openAsBlob` or `events.once` in a `try` without `await` counted as caught. These functions give a promise, so the `catch` does not stop their error. Now only `await` in the `try` makes the call caught.
