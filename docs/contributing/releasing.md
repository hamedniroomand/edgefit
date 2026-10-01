# Releasing

`edgefit` is published to npm by `.github/workflows/release.yml` when a version tag such as `v0.3.0` is pushed. Moving the action's major tag (`v0`) does not start a release, because only `v*.*.*` tags trigger it. The
workflow uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers): GitHub Actions
proves its identity to npm with OIDC, so no npm token is stored anywhere, and npm adds
[provenance](https://docs.npmjs.com/generating-provenance-statements) when the repository is
public.

A trusted publisher can only be configured for a package that exists, so the **first version is
published by hand**.

## First release (by hand)

### 1. Prepare

Keep the release workflow disabled for now (**Actions → Release → ⋯ → Disable workflow**), so the
tag pushed below does not try to publish a second time.

```sh
git switch main && git pull
vp install
vp run ready
```

Check the version in `package.json` and rename `## Unreleased` in `CHANGELOG.md` to that version.

### 2. Publish

Pack with pnpm, then publish the tarball with npm, exactly as the workflow does:

```sh
vp pm pack --pack-destination .release
npm login
npm publish .release/edgefit-0.1.0.tgz --access public
rm -r .release
```

npm asks for a second factor. Check the result with `npm view edgefit`.

### 3. Tag and release on GitHub

The GitHub Action is referenced by tag (`hamedniroomand/edgefit@v0`), so the tag is needed even
though the workflow did not publish:

```sh
git tag v0.1.0
git push origin v0.1.0
gh release create v0.1.0 --title v0.1.0 --notes "See CHANGELOG.md"
```

### 4. Connect the repository to npm

On [npmjs.com](https://www.npmjs.com/package/edgefit), open **Settings → Trusted publishing**,
choose **GitHub Actions** and enter:

| Field                | Value            |
| -------------------- | ---------------- |
| Organization or user | `hamedniroomand` |
| Repository           | `edgefit`        |
| Workflow filename    | `release.yml`    |
| Environment name     | `npm`            |

The environment must match `environment: npm` in the workflow. Create it on GitHub under
**Settings → Environments**; protection rules there (required reviewers, only `v*.*.*` tags) then apply
to every publish.

Once a release has gone through the workflow, restrict publishing on npm under **Settings →
Publishing access → Require two-factor authentication and disallow tokens**. Trusted publishing
keeps working, and a leaked token can no longer publish.

### 5. Enable the workflow

**Actions → Release → Enable workflow.**

## Every later release

If the text report changed shape, re-record the demo first: `vp pack && vhs docs/demo.tape` (needs `vhs`, and `vp install` in `apps/`).

Changes are described with [changesets](https://github.com/changesets/changesets): each pull request that users will notice adds a file in `.changeset/` (`vp run changeset`).

1. When changesets reach `main`, the **Release PR** workflow opens or updates one pull request,
   `chore(release): version packages`. It bumps `version` in `package.json` and writes the new
   `CHANGELOG.md` section from the changesets. Read the section and edit the changeset files or
   the generated text if it needs it.
2. Merge that pull request.
3. Tag the merge commit and push the tag:

   ```sh
   git switch main && git pull
   git tag v0.2.0
   git push origin v0.2.0
   ```

The Release PR workflow opens its pull request with `GITHUB_TOKEN`, which does not start other workflows, so CI does not run on it. Store a fine-grained token (contents and pull requests: write) as the `RELEASE_PR_TOKEN` secret to get CI on that pull request, or close and reopen it to run the checks.

For a pre-release, run `vp run changeset pre enter beta` on a branch, merge, and leave with `vp run changeset pre exit`; tag `v0.2.0-beta.1` as below.

The workflow then:

1. checks that the tag matches the package version,
2. runs `vp run ready` (format, lint, type check, tests, build),
3. packs the package with pnpm and publishes it with npm 11.5.1 or later through trusted
   publishing,
4. creates the GitHub release from the changelog section, plus the issues the release closes.

A tag with a pre-release suffix, such as `v0.2.0-beta.1`, is published under the `next` dist-tag
and marked as a pre-release on GitHub.

After a stable release, the workflow moves the action's major tag (`v0`, then `v1` from 1.0.0 on) to the release commit, so nothing has to be done by hand. The action installs the `edgefit` version in its own `package.json`, so it needs nothing else on release: the tag holds that version, and the workflow publishes to npm before it moves `v0`. A pre-release tag does not move it. The tag ruleset protects only `v*.*.*`, and the Release workflow only starts for those, so moving the major tag starts nothing.

If the tag is ever wrong, move it with `git tag -f v0 <release tag> && git push -f origin v0`.
