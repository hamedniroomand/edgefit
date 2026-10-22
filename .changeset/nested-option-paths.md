---
'edgefit': patch
---

`edgefit check` reads a nested option when the data of edgefit names its path. A project that passes `{ auth: { lock: navigatorLock } }` or `{ realtime: { worker: true } }` to `createClient` of `@supabase/supabase-js` now gets the findings of `@supabase/auth-js` and `@supabase/realtime-js`, such as `navigator.locks.request` on workerd and Bun and `URL.createObjectURL` on workerd. A project that sets neither option shows no finding, as before.
