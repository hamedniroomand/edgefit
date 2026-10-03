---
'edgefit': minor
---

Read `import * as ns from './file'` the same way as a `require` that is only read by member: the file is asked only for the members read from `ns`, and a Node.js module that it exports under one of them is that module in the reading file. A `ns` that is passed on, stored, exported again or read with a computed key still asks for all of the file. A file that is imported as a namespace no longer reports the unused exports of the file as findings, so `edgefit check` can show fewer findings. The ESM and the CommonJS build of one package now give the same result.
