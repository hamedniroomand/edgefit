# Sample apps

Small apps that install real packages, exact versions pinned in each `package.json` and the
lockfile. `test/apps` checks edgefit against them. This folder is a pnpm workspace of its
own, not part of the repository's, and it is not in the published package (`files` lists only
`dist` and `data`).

```sh
cd apps && vp install --frozen-lockfile
vp test --project apps
```

To move a version, change the pin, run `vp install` here, and read the result again
against the runtime before changing an expectation.

## Built apps

Some apps are built by a framework or a platform CLI, and `test/apps` checks the output. The
output is never committed: it is ignored, and the tests for it skip when it is missing.

| App | Build | Output |
| --- | --- | --- |
| `next-edge` | `npm run build:vercel` in the app | `.vercel/output` |
| `sveltekit-netlify` | `npm run build:netlify` in the app | `.netlify` |

The build of `next-edge` needs the network the first time (`npx` fetches the Vercel CLI, pinned in the script).
The `.vercel/project.json` in the app holds the project settings, so `vercel build` needs no login.

CI builds them in `.github/workflows/sample-builds.yml`, caches the build on the lockfile and the
app, and rebuilds it every week.
