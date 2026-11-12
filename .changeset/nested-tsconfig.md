---
'edgefit': patch
---

When the project root had no `tsconfig.json` and a folder above the root had one, edgefit did not read a `tsconfig.json` below the root, such as `src/tsconfig.json`. So it dropped an import that the bundler keeps because of `verbatimModuleSyntax`, `preserveValueImports` or `importsNotUsedAsValues`, and it did not report a failure when that module loads. edgefit now keeps these imports. A config above the root still does not apply. In this case, edgefit still does not read the `paths`, `baseUrl` and JSX options of a config below the root.
