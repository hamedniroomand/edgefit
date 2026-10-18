---
'edgefit': patch
---

A minified `typeof` check now works like its long form. A minifier writes `typeof x === 'undefined'` as `typeof x > "u"`, and `typeof x !== 'undefined'` as `typeof x < "u"`. Before, edgefit did not read these forms as checks. Code behind them gave false findings, for example `typeof globalThis.Deno > "u" ? 0 : globalThis.Deno.version` on Workers. edgefit reads both orders, as in `"u" < typeof x`.
