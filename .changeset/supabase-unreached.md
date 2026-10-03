---
'edgefit': patch
---

List the browser-only paths of `@supabase/auth-js` and `@supabase/realtime-js` as code that `workerd` and Bun never reach: the `navigator.locks` lock that only the deprecated `lock` option uses, and the Web Worker heartbeat that only the `worker` option starts. `@supabase/supabase-js` no longer fails on them.
