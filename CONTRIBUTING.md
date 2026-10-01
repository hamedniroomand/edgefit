# Contributing

Thanks for taking the time to help. Bug reports, corrections to the compatibility data, docs fixes and code are all welcome.

## Reporting a problem

- **A wrong result** (a false error, or something that should have been caught): use the [wrong result](https://github.com/hamedniroomand/edgefit/issues/new?template=wrong-result.yml) template. Include the target, the API, and the version `edgefit targets` prints.
- **A bug** in the CLI, the action or the docs: use the [bug report](https://github.com/hamedniroomand/edgefit/issues/new?template=bug-report.yml) template.
- **A security issue:** see [SECURITY.md](SECURITY.md). Please do not open a public issue.

## Development

You need Node.js 22.18 or newer and [Vite+](https://viteplus.dev/guide/).

```sh
vp install        # install dependencies
vp check --fix    # format, lint and type check
vp run -r test    # run the tests
vp run -r build   # build the packages
vp run ready      # all of the above, as CI runs it
vp run docs:dev   # the docs site; docs:build and docs:preview too
```

The [contributing guide](https://edgefit.kitdev.space/contributing/) covers the repository layout and architecture, how the compatibility data is maintained, and how to add a [suggested fix](https://edgefit.kitdev.space/contributing/suggestions).

## Pull requests

- Open an issue first for anything larger than a small fix, so we can agree on the approach.
- Keep each pull request to one change, and add a test that shows it.
- Changes to `data/overrides` need a link to the runtime source they were read from, at the pinned version.
- Add a [changeset](.changeset/README.md) for anything users will notice: run `vp run changeset`, choose the bump and describe the change in a sentence or two. Docs, tests and CI changes need none.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), for example `fix(edgefit): resolve browser field for workerd`. A git hook checks this.

By contributing, you agree that your work is released under the [MIT License](LICENSE), and to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
