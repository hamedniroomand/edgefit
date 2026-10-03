---
'edgefit': patch
---

Follow a function with no parameter that only returns `require('node:x')`, with or without a `try` whose `catch` returns nothing. A variable that holds the call is a module binding, so the members that the code reads are checked, and the `require` inside the function is no longer reported as passed on. A function that is exported, passed on, or has a parameter or a second statement is not followed.
