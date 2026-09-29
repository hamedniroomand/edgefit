# Architecture

A check runs in five stages. Each has its own folder under `packages/edgefit/src`.

<Steps>

### Load the config

`config/` finds `edgefit.config.*`, bundles it with esbuild so TypeScript works on any Node version, imports it, and validates it. CLI flags are merged on top in `cli/project.ts`.

### Create the targets

`targets/` builds one `Target` per requested runtime. A target knows its export conditions, the esbuild plugins it needs (Deno's specifiers and import map, for example), its globals, and how to look up an API in its data. Runtime settings are read here: wrangler config and compatibility gates for workerd, the pinned version for Bun, `deno.json` for Deno.

### Resolve the graph

`resolve/` runs esbuild from the entry with the target's conditions, without writing output, and turns the metafile into a module graph. Node built-ins and runtime-provided modules are kept external. Every module records who imported it, which is where the `via` chain comes from.

### Extract usages

`extract/` parses each module with oxc-parser and walks the AST with scope tracking. It records imports of built-ins, `require` calls, member access on those bindings, and globals that are not shadowed. Anything it cannot resolve statically, such as `require(name)` or `fs[method]`, becomes a dynamic usage.

For `--built`, `built/` then maps each usage through the sourcemaps to its original file and package, and marks bundled unenv code as `mocked`.

### Classify and report

`core/` looks up each usage in the target's data (`data/`), turns problems into findings, applies `ignore` rules and `levels`, and groups repeated uses. `report/` renders the result as text, JSON or GitHub annotations, and computes `compare` tables and `diff` results.

</Steps>

## Data

`data/` loads the vendored files from `packages/edgefit/data`:

- `providers/matrix.ts` reads the workers-nodejs-compat-matrix dumps and compares each runtime with the Node baseline.
- `providers/overrides.ts` applies the curated override file for the target.
- `providers/runtime-compat-data.ts` answers for Web APIs the matrix does not describe.
- `compat-index.ts` merges them into one lookup, where the more precise source wins.

## Design rules

- **A false error is worse than a missed warning.** Resolution follows the real bundler, and every heuristic is measured against real projects before it ships.
- **Never claim safety.** When the analysis cannot tell, the finding is `unknown`.
- **Results are reproducible.** No network access and no data that changes between runs.
- **Each finding is traceable** to a data source and, for curated entries, to a line of runtime source.
