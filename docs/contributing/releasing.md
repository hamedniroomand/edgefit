# Releasing

`edgefit` is published to npm by `.github/workflows/release.yml` when a `v*` tag is pushed. The
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

The GitHub Action is referenced by tag (`hamedniroomand/edgefit@v1`), so the tag is needed even
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
**Settings → Environments**; protection rules there (required reviewers, only `v*` tags) then apply
to every publish.

Once a release has gone through the workflow, restrict publishing on npm under **Settings →
Publishing access → Require two-factor authentication and disallow tokens**. Trusted publishing
keeps working, and a leaked token can no longer publish.

### 5. Enable the workflow

**Actions → Release → Enable workflow.**

## Every later release

1. Update `version` in `package.json` and rename the `## Unreleased` section of `CHANGELOG.md` to
   `## <version>`. Changes merged between releases add their line under `## Unreleased`.
2. Commit and merge to `main`.
3. Tag and push:

   ```sh
   git tag v0.2.0
   git push origin v0.2.0
   ```

The workflow then:

1. checks that the tag matches the package version,
2. runs `vp run ready` (format, lint, type check, tests, build),
3. packs the package with pnpm and publishes it with npm 11.5.1 or later through trusted
   publishing,
4. creates the GitHub release from the changelog section.

A tag with a pre-release suffix, such as `v0.2.0-beta.1`, is published under the `next` dist-tag
and marked as a pre-release on GitHub.

The action's moving major tag (`v1`) is not updated by the workflow. Move it by hand after a
stable release:

```sh
git tag -f v1 && git push -f origin v1
```
