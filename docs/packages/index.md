---
title: Package compatibility
---

# Package compatibility

Which popular npm packages pass edgefit's static check on Cloudflare Workers, Bun and Deno. Each package is installed without running its scripts, and every public entry point is checked with all of its exports used.

A ✓ is not a guarantee: read [what a pass means](/guide/packages) before relying on it. Your own app may import less of a package than this check assumes, so run `edgefit check` on it. To check a package that is not listed, run `npx edgefit package <name>`, or [ask for it to be added](https://github.com/hamedniroomand/edgefit/issues/new?template=package-request.yml).

<PackageTable />
