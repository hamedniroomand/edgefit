---
'edgefit': patch
---

An import that is only used as a type no longer gives a finding. A bundler drops such an import from a TypeScript file, so `import { ServerResponse } from 'node:http'` that is only used in `as ServerResponse` uses no API. When an import has some names used as values, edgefit reports only those names. The check still keeps every import when the nearest `tsconfig.json` sets `verbatimModuleSyntax`, `preserveValueImports`, or `importsNotUsedAsValues` to `preserve` or `error`.
