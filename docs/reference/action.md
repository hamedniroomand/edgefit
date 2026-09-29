# GitHub Action

```yaml
- uses: hamedniroomand/edgefit@v1
  with:
    targets: workerd
```

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
- uses: hamedniroomand/edgefit@v1
  with:
    working-directory: apps/api
    targets: workerd
- uses: hamedniroomand/edgefit@v1
  with:
    working-directory: apps/worker
    targets: workerd, bun
```

Each combination of working directory and targets gets its own comment.
