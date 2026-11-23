---
'edgefit': patch
---

A strict compare with `null`, such as `globalThis.Deno === null ? void 0 : globalThis.Deno.env`, no longer guards the read: `undefined === null` is false, so the read still runs when the global is missing. A minified helper that returns `!0` or `!1` after a test now guards like one that returns `true` or `false`.
