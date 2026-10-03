---
'edgefit': minor
---

Read a template literal or a `+` of strings and `const` strings as the string it spells, for `require()` and `import()`. The call ``require(`cardinal${SUFFIX}`)`` with `const SUFFIX = ''` is a `require('cardinal')` and no longer an `unknown` access. A join with a name that is not a `const` string stays `unknown`.
