---
'edgefit': patch
---

Read `const { a } = require('./file')`, and the form that `tsc` writes for `import()` in CommonJS, as an import of the name `a`, and read `exports.name = binding` of a Node.js module as an export of it. A Node.js module that one CommonJS file exports and another destructures is followed in the importing file. A `require()` that is stored whole or read as `require('./file').name` still takes the whole file.
