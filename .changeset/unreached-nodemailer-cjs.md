---
'edgefit': patch
---

List the CommonJS sendmail transport of `nodemailer` 10.0.13 to 10.2.0 as code that runs only with the `sendmail` option, as the ES module transport already is. `edgefit check` on a project that calls `require('nodemailer')` no longer shows `node:child_process.spawn` as an error on workerd, and it also hides it in a project that sets the `sendmail` option.
