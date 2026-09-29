# Development setup

Thanks for helping out. This page gets you from a fresh clone to a passing test run.

## Prerequisites

- Node.js 22.18 or newer
- [Vite+](https://viteplus.dev/guide/), which provides the `vp` command. It wraps pnpm, Vite, Vitest, Oxlint and Oxfmt in one tool

## Get the code running

<Steps>

### Clone and install

```sh
git clone https://github.com/hamedniroomand/edgefit.git
cd edgefit
vp install
```

### Run the checks

```sh
vp check --fix    # format, lint and type check
vp run -r test    # run the tests
vp run -r build   # build the packages
```

Or all of it at once, which is what CI runs:

```sh
vp run ready
```

### Try your build

```sh
node packages/edgefit/dist/cli/main.mjs check --root path/to/a/project
```

</Steps>

## Repository layout

```
edgefit/
├── src/                  the CLI and library, see Architecture
├── data/                 vendored compatibility data and curated overrides
├── scripts/probe/        runtime probes, run in CI
├── test/                 tests and fixture projects
├── action.yml            the GitHub Action
├── action/               scripts the action runs
├── docs/                 this site
└── .github/workflows/    CI
```

## Working on the docs

```sh
vp run docs:dev       # local server with hot reload
vp run docs:build     # production build in docs/.vitepress/dist
vp run docs:preview   # serve that build
```

The site is built with VitePress and deployed to GitHub Pages on every push to `main` that touches `docs/`.

## Tests

Tests live in `packages/edgefit/test` and mirror the `src` folders. End-to-end behavior is tested against small projects in `test/fixtures`, each with a hand-made `node_modules` so results never depend on the registry.

When you fix a false positive or a missed finding, add a fixture or a case that shows it. That is how precision is kept from regressing.

## Commits and pull requests

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), checked by commitlint in a git hook: `fix(edgefit): ...`, `feat: ...`, `docs: ...`.
- Keep a pull request to one change. Say what it fixes and how you checked it.
- Changes to compatibility data need a source. See [Compatibility data](/contributing/data).

## Roadmap

Planned work is written up as specs in [`docs/specs`](https://github.com/hamedniroomand/edgefit/tree/main/docs/specs). If you want to pick one up, open an issue first so work is not duplicated.
