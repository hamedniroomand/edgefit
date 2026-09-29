# Changelog

## Unreleased

- `import(name)` and `require(name)` are resolved when `name` is a `const` holding a plain string, so they are no longer reported as computed. This removes the `import(<expression>)` warning Hono's `color.js` produced.

## 0.1.0

- Initial release.
