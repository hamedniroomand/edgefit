---
'edgefit': patch
---

Data: the compatibility data now describes Bun 1.4.4. It was Bun 1.4.2. The data for workerd 1.20260929.1 and Deno 2.9.7 does not change. In the Bun data, `dns.Resolver` is now a class, as in Node. edgefit treats a class and a function as the same kind, so no result changes. `edgefit targets` shows Bun 1.4.4. The note for an older Bun version, such as "Bun 1.2.0 is older than the data (1.4.4)", names the new version.
