---
'edgefit': patch
---

Count an option before a spread only when the spread is a known object literal that does not hold it, such as `...(check && { checkServerIdentity })`. A spread that can replace the option with `undefined` now gives no finding.
