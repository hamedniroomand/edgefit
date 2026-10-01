# Changesets

A pull request that changes what users see adds a changeset: run `vp run changeset`, choose the
bump (patch, minor or major) and write one or two sentences that will become the changelog entry.
Commit the generated file in `.changeset/` with the pull request.

Pull requests that users will not notice (docs, tests, CI, refactors) need none. Run
`vp run changeset --empty` if you want to say so explicitly.

Maintainers: a workflow opens a "version packages" pull request from the changesets on `main`.
See [Releasing](https://edgefit.kitdev.space/contributing/releasing).
