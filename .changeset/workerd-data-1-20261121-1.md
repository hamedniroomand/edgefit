---
'edgefit': patch
---

Bump the workerd data to 1.20261121.1, with compatibility date 2026-11-21. `assert.Assert`, `util.diff`, `util.convertProcessSignalToExitCode` and `util.setTraceSigInt` (also on `sys`) now exist on workerd, and `util.getSystemErrorName`, `util.getSystemErrorMessage` and `util.transferableAbortSignal` now work, so a use of them is no longer reported.
