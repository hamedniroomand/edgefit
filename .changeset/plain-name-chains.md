---
'edgefit': patch
---

A statement that only reads a member of a compiled chain on a plain name, or calls it directly, is now a use. For example, `(BroadcastChannel == null ? void 0 : BroadcastChannel.prototype).x;` throws when `BroadcastChannel` is missing, the same as `(BroadcastChannel?.prototype).x;`. Before, edgefit read the compare as a guard of the whole statement. A statement that is a list of such reads joined with commas, as minified code writes it, counts too. A read in a declaration, a `return`, an argument or a test, a call through `.call` or `.apply`, and every other form on a plain name keep their result.
