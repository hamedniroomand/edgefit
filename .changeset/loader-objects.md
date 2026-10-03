---
'edgefit': minor
---

Read an object whose values are all functions that only return `require('node:x')` as the loads of those modules, when every use of the object is a call of one of its functions, as in `loaders[name]()`. A call with a key that is not a known string counts every module of the object. `undici` writes this for its runtime checks. An object that the code passes on, or reads without a call, stays `unknown`.
