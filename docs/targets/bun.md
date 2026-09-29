# Bun

Target name: `bun`.

```sh
npx edgefit check --target bun --entry src/index.ts
```

## What the data covers

- **Node API data** is the compatibility matrix's Bun `1.3.13` dump, compared with the same Node baseline as the other targets.
- **Curated overrides** cover APIs that exist in Bun but throw or do nothing, such as `v8.setFlagsFromString` and `async_hooks.createHook`. They are read from Bun's Node compatibility docs and sources at the same version.
- The overrides also mark matrix differences that are values rather than behavior, such as `process.versions.*`, as supported. Bun reporting a different version string is not a compatibility problem.

## Your Bun version

edgefit reads the Bun version your project pins, from `packageManager: "bun@x"` in `package.json` or from `.bun-version`. If it is older than the data, the report says so:

```
settings Bun 1.2.0 (from package.json packageManager)
note: Bun 1.2.0 is older than the data (1.3.13); APIs added to Bun since then are reported as supported.
```

The data is not rewound to your version, so APIs that Bun added after your pinned version will pass. Upgrade Bun, or keep this in mind when reading the report. You can also set the version in the config with `bun: { version: '1.3.13' }`.

## Export conditions

Packages are resolved with `bun` and `node`, then `import`, `require` and `default`. As in Bun itself, the first condition a package lists wins. `browser` fields are not applied.
