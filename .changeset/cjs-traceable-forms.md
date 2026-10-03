---
'edgefit': minor
---

Read more forms of a CommonJS module, so that a file such as `index.js` of `mysql2` can be traced. `exports.__defineGetter__('name', fn)` is a getter export. `exports.name = <value>` is an export when the module computes the value when it loads, and `exports.other = exports.name` is the same export under another name. `module.exports = name` is read when `name` is a function or class of the module that nothing else names. A `require` inside a function asks for its module only when the function is used. A Worker that imports `createConnection` from `mysql2` no longer gets the finding of `createServer`.
