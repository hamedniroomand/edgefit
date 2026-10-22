---
'edgefit': patch
---

Report a finding for a package in the list of code that a target does not run when the project sets the option that makes that code run. For example, `edgefit check` now reports `node:tls.connect` of `got` on workerd when the project passes `http2: true`, and `node:child_process.spawn` of `nodemailer` when it passes `sendmail: true`. The option must be a direct property in a file of your own code. A property inside another object does not count, unless the entry names its path, and a check of build output does not count.
