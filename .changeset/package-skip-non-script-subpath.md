---
'edgefit': minor
---

`edgefit package` now lists a subpath that it does not check. The text report prints a `skipped` line for it. The JSON result has a new `skipped` list. edgefit skips a subpath when it maps only to files that are not script files. For example, `socket.io-client` exports the sourcemap `./dist/socket.io.js.map`. Before, that subpath had the status `error` on every runtime, with the message `No load`.
