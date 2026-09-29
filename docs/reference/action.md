# GitHub Action

```yaml
- uses: hamedniroomand/edgefit@v0
  with:
    targets: workerd
```

`@v0` is a moving tag that follows the newest 0.x release. While edgefit is 0.x, a minor release can change behavior, so pin an exact release (`@v0.3.0`) or a commit SHA if you want a workflow that never changes on its own. From 1.0.0 the tag will be `@v1`.

The action runs on `pull_request` events. It checks the merge base and the head, comments with the difference and annotates new findings. See [Pull request checks](/guide/ci) for a full workflow.

## Inputs

| Input               | Default                                    | Description                                                                  |
| ------------------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| `targets`           | the config's `targets`, then `workerd`     | Targets, separated by commas or spaces                                       |
| `entry`             | the config's `entry`, then wrangler `main` | Entry point                                                                  |
| `working-directory` | `.`                                        | Project root, relative to the repository root                                |
| `fail-on`           | `new-errors`                               | `new-errors`, `errors` or `never`                                            |
| `install-command`   | chosen from the lockfile                   | Installs dependencies in the repository root, for both the base and the head |
| `github-token`      | `github.token`                             | Token for the comment. Needs `pull-requests: write`                          |

## Permissions

```yaml
permissions:
  contents: read
  pull-requests: write
```

Without `pull-requests: write`, the action still annotates findings but cannot comment.

## Caching

The base report is saved with `actions/cache`, keyed by the base commit, the edgefit build and data, and the inputs. A second pull request on the same base reuses it.

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

Each combination of working directory and targets gets its own comment.
