---
'edgefit': patch
---

In built output, edgefit now lists the module that Turbopack writes for a Node.js built-in (`t.exports = e.x("node:…", () => require(…))`) under `build output`. Before this change, edgefit mapped it through the sourcemap, and the sourcemap can give it the file of the code before it. With `next` 16.4.0, a warning about `node:async_hooks` or `node:buffer` in an Edge route showed as a warning about `next`, at a line that does not use the module. Your own loads of a Node.js module through `e.x(…)` stay at your file.
