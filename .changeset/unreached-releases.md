---
'edgefit': patch
---

Add the newest releases to the data for code that a target never runs: `nodemailer` 10.1.2 to 10.2.0, `@supabase/auth-js` and `@supabase/realtime-js` 2.118.0, `next` 16.4.2, and `postal-mime` 4.0.7 to 4.1.3. For example, `edgefit package nodemailer` no longer fails on `node:child_process.spawn` on workerd, and `edgefit package @supabase/supabase-js` no longer fails on workerd and Bun.
