---
'edgefit': minor
---

An override can now name the options that make a call fail. An option is a key, a key with a literal value, or a key that fails only while a workerd compatibility flag is on. A call of such an API is a finding only when it passes one of those options in an object literal, or in a local variable that holds one. A call whose options edgefit cannot read gets no finding. The limitations page lists these calls.
