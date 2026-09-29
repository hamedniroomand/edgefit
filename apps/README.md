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
