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
node dist/cli/main.mjs check --root path/to/a/project
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
vp run docs:results   # download the package table results
```

The [packages page](/packages/) reads its results from the `package-results` branch. Run `vp run docs:results` to show the table locally. Run it again to get newer results.

The site is built with VitePress and deployed to GitHub Pages on every push to `main` that touches `docs/`.

## Tests

Tests live in `test` and mirror the `src` folders. End-to-end behavior is tested against small projects in `test/fixtures`, each with a hand-made `node_modules` so results never depend on the registry.

When you fix a false positive or a missed finding, add a fixture or a case that shows it. That is how precision is kept from regressing.

`test/core/sample-apps.test.ts` holds small stand-ins for apps that are known to run on Workers: a Hono app and a Nitro build that bundles jose. Their dependencies are copies of real published code. A known-good app must report no errors and no warnings that nobody can act on, so a change that breaks one of these tests is a precision regression, not a test to update. To add one, copy the smallest real files that show the pattern into a fixture, keep their license header, and assert what a person deploying that code should see.

Apps that need whole real packages live in `apps/`, a pnpm workspace of its own with exact pins, and `test/apps` checks them. Install them with `vp install` inside `apps/`; CI does. To add one, make a folder with a `package.json`, a `wrangler.jsonc` and a few lines of source, read what edgefit reports against the runtime source, and assert that.

## Commits and pull requests

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), checked by commitlint in a git hook: `fix(edgefit): ...`, `feat: ...`, `docs: ...`.
- Keep a pull request to one change. Say what it fixes and how you checked it.
- Changes to compatibility data need a source. See [Compatibility data](/contributing/data).

## Roadmap

Planned work is tracked as [issues](https://github.com/hamedniroomand/edgefit/issues), grouped by milestone. If you want to pick one up, comment on it first so work is not duplicated.
