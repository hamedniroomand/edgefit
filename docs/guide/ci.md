# Pull request checks

Running `edgefit check` in CI works, but once a project has a few accepted findings, a full report on every pull request turns into noise. What reviewers want to know is whether this change makes things worse. That is what the GitHub Action and `edgefit diff` are for.

## The GitHub Action

```yaml [.github/workflows/edgefit.yml]
name: edgefit

on: pull_request

permissions:
  contents: read
  pull-requests: write # for the comment

jobs:
  edgefit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v5
        with:
          node-version: 22
      - uses: hamedniroomand/edgefit@v0
        with:
          targets: workerd
          fail-on: new-errors
```

On every pull request, the action:

1. Finds the merge base with the target branch, so only what the pull request itself adds counts.
2. Checks the base in a separate `git worktree`, installing its dependencies. The base report is cached by commit, so this only happens once per base.
3. Checks the head.
4. Posts one comment with the difference, and updates the same comment on later pushes.
5. Adds annotations on the new findings, in the "Files changed" view.

The comment looks like this:

```
⚠ Runtime compatibility regression · workerd

New: node:fs.watch file watching is not implemented; throws ERR_UNSUPPORTED_OPERATION (workerd)
  chokidar@4.0.3 · node_modules/chokidar/handler.js:212:3
  via src/index.ts > src/dev/reload.ts > chokidar

Fixed: node:child_process.exec every child_process function throws ERR_METHOD_NOT_IMPLEMENTED; Workers cannot spawn processes (workerd)
  dual-runtime@1.3.0

1 new, 1 fixed, 4 unchanged
```

A comment is only created once there is something new or fixed. On a quiet pull request, the action stays quiet.

### Good to know

- The action also works on `push`, where it compares with the commit before the push, and on manual or scheduled runs, where every finding counts as new. Only pull requests get a comment. See [Other events](/reference/action#other-events).
- Pull requests from forks get a read-only token. They still get annotations, but no comment.
- If the base cannot be checked, for example because edgefit is being set up in this very pull request, every finding counts as new and the action logs a warning.
- `fetch-depth: 0` is optional. Without it, the action fetches the history it needs itself.
- For a monorepo, add one step per project with its own `working-directory`. Each gets its own comment.

All inputs are listed in the [action reference](/reference/action).

## When the job fails

`fail-on` decides:

| Value        | Fails when                                             |
| ------------ | ------------------------------------------------------ |
| `new-errors` | the pull request adds an error-level finding (default) |
| `errors`     | the head has any error-level finding, new or not       |
| `never`      | never; report only                                     |

## How findings are matched

A finding in the base and one in the head are the same when they share the target, category, API and package name. For your own code, the file is used instead of the package.

Versions and line numbers are ignored on purpose. A patch release of a dependency, or an unrelated edit above a line, does not make a finding show up as fixed and then new again.

## Other CI systems

The action is a thin wrapper around two commands you can run anywhere:

```sh
# on the base commit
npx edgefit check --format json > base.json

# on the head commit
npx edgefit check --format json > head.json

npx edgefit diff base.json head.json
```

`edgefit diff` accepts `--fail-on` with the same values, and `--format github` or `--format json`. Both reports must come from the same edgefit version.

## Annotations without the action

For a plain check in GitHub Actions, `--format github` prints workflow commands that GitHub turns into annotations:

```sh
npx edgefit check --format github
```
