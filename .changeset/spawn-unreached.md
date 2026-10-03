---
'edgefit': patch
---

List the sendmail transport of `nodemailer` and the `mongocryptd` spawn of `mongodb` as code that `workerd` never reaches. Both start a local process that a Worker does not have. The two packages no longer fail on `node:child_process.spawn`.
