# GitHub Action

```yaml
- uses: hamedniroomand/edgefit@v0
  with:
    targets: workerd
```

`@v0` is a moving tag that follows the newest 0.x release. While edgefit is 0.x, a minor release can change behavior, so pin an exact release (`@v0.3.0`) or a commit SHA if you want a workflow that never changes on its own. From 1.0.0 the tag will be `@v1`.

The action is made for `pull_request` events: it checks the merge base and the head, comments with the difference and annotates new findings. It also works on other events, see [Other events](#other-events). See [Pull request checks](/guide/ci) for a full workflow.

## Other events

| Event                                                                            | What it compares with                             | Where the result goes                   |
| -------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------- |
| `pull_request`, `pull_request_target`                                            | The merge base with the target branch             | A comment, annotations, the job summary |
| `push`                                                                           | The commit before the push, so what the push adds | Annotations and the job summary         |
| Anything else (`workflow_dispatch`, `schedule`) and a push that creates a branch | Nothing, so every finding counts as new           | Annotations and the job summary         |

With no base, `fail-on: new-errors` fails on any error, since every finding is new. A pull request comment is only possible on a pull request, so other events do not post one. If you only want the pull request check, add `if: github.event_name == 'pull_request'` to the step.

## Inputs

| Input               | Default                                    | Description                                                                  |
| ------------------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| `targets`           | the config's `targets`, then `workerd`     | Targets, separated by commas or spaces                                       |
| `entry`             | the config's `entry`, then wrangler `main` | Entry point                                                                  |
| `working-directory` | `.`                                        | Project root, relative to the repository root                                |
| `fail-on`           | `new-errors`                               | `new-errors`, `errors` or `never`                                            |
| `install-command`   | chosen from the lockfile                   | Installs dependencies in the repository root, for both the base and the head |
| `edgefit-version`   | the version the action was released with   | edgefit version to run, for example `0.4.0`                                  |
| `edgefit-package`   |                                            | Path to a tarball to install instead, to test a package before publishing    |
| `github-token`      | `github.token`                             | Token for the comment. Needs `pull-requests: write`                          |

## Build output

If the entry is build output, such as `.output/server/index.mjs`, the base commit needs a build too: the action checks it out in a clean worktree, and a build made before the action ran only exists for the head. Build in `install-command`, which runs for both:

```yaml
- uses: hamedniroomand/edgefit@v0
  with:
    install-command: pnpm install --frozen-lockfile && pnpm build
```

Without it, the action warns that it could not check the base, and every finding counts as new.

## Which edgefit runs

The action installs the published `edgefit` package from npm, so it needs no pnpm and builds nothing. It runs the version it was released with: `@v0.4.0` runs `edgefit@0.4.0`, and `@v0` runs the newest 0.x release. Set `edgefit-version` to run another one, for example a newer CLI with an older action while you test it.

After installing, the action runs `npm audit signatures`, so the registry signature and the provenance of what it installed are verified. It fails if they do not verify. Node.js 22.18 or newer must be on the runner; add `actions/setup-node` if yours is older.

If a release was published a moment ago, the action tries the install for about a minute before it fails.

`edgefit-version: source` builds the action's own checkout as older releases did. It is kept for one release and will be removed.

## Permissions

```yaml
permissions:
  contents: read
  pull-requests: write
```

Without `pull-requests: write`, the action still annotates findings but cannot comment.

## Caching

The base report is saved with `actions/cache`, keyed by the base commit, the edgefit version and the inputs. A second pull request on the same base reuses it.

## Monorepos

Use one step per project:

```yaml
- uses: hamedniroomand/edgefit@v0
  with:
    working-directory: apps/api
    targets: workerd
- uses: hamedniroomand/edgefit@v0
  with:
    working-directory: apps/worker
    targets: workerd, bun
```

Each combination of working directory and targets gets its own comment. A new finding with a [suggested fix](/guide/findings#suggested-fixes) shows it under the finding, in the comment and in the annotation.
