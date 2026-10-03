---
'edgefit': patch
---

Cover `nodemailer` 10.0.14 in the list of code that a package ships and a target does not run. The `node:child_process.spawn` finding of the sendmail transport is guarded on workerd for this release, as it is for 10.0.13.
