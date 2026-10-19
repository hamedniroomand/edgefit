---
'edgefit': patch
---

A tsconfig `extends` with a package name, such as `"extends": "@tsconfig/strictest/tsconfig.json"`, or with an absolute path is now followed. Before, edgefit did not read a `verbatimModuleSyntax` that such a base config sets. So it dropped an import that the bundler keeps, and it did not report a failure when that module loads. A package or file that is not there, or that the `exports` of the package do not list, still gives no base config. Any other error when edgefit resolves the name now stops the run. The `tsconfig` field of the package.json is not read. A base config from a package or an absolute path can only make edgefit keep more imports, never fewer than the relative bases keep.
