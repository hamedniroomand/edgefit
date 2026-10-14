---
'edgefit': patch
---

Add the newest releases to the data for code that a target never runs. The new releases are `nodemailer` 10.0.16 to 10.1.1, `@supabase/auth-js` and `@supabase/realtime-js` 2.117.3, `next` 16.4.0, and `postal-mime` 4.0.5 and 4.0.6. In these releases, the listed APIs in the listed files are guarded on the listed targets, as in the earlier releases. For example, `nodemailer` no longer fails on `node:child_process` on workerd.
