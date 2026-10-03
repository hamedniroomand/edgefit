---
'edgefit': patch
---

Stop the `tsconfig.json` search at the project root. A config above the root no longer makes an import that the project uses only as a type fail to resolve. A project with no config of its own is checked as if the bundler had none.
