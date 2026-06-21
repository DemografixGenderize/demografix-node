# Releasing

This package publishes to npm as [`demografix`](https://www.npmjs.com/package/demografix).
Releases run from GitHub Actions when you push a `vX.Y.Z` tag. The workflow builds, publishes
to npm, and creates a GitHub Release.

## One-time setup

You only do this once per package.

### npm account and package access

1. Create an npm account and join the org or team that owns `demografix`.
2. Confirm you can publish the package. The first publish of a brand-new name must be done by a
   maintainer who has rights to claim it.

### Trusted Publishing (OIDC, preferred)

The release workflow authenticates to npm with OIDC, so no token is stored in the repository.
Configure the trusted publisher on npm once:

1. Sign in to npmjs.com and open the `demografix` package settings.
2. Go to **Publishing access** and add a **Trusted Publisher**.
3. Set the source to GitHub Actions with:
   - Organization / owner: `DemografixGenderize`
   - Repository: `demografix-node`
   - Workflow filename: `release.yml`
   - Environment: `release`
4. Save. The `publish` job runs in the GitHub environment named `release`, which must match the
   value above. Create that environment under repository **Settings -> Environments** if it does
   not exist.

With Trusted Publishing the workflow needs `permissions: id-token: write`, which is already set.
No `NPM_TOKEN` secret is required.

### Token fallback (only if OIDC is not available)

If the npm account is not set up for Trusted Publishing, publish with a granular access token
instead:

1. On npmjs.com create a **Granular Access Token** with read and write access to the `demografix`
   package.
2. In the GitHub repository, add it as a secret named `NPM_TOKEN` under
   **Settings -> Secrets and variables -> Actions**.
3. In `.github/workflows/release.yml`, uncomment the `env` block on the publish step so it reads:

   ```yaml
   env:
     NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
   ```

Trusted Publishing is the better option because it stores no long-lived credential. Use the token
only when OIDC is not an option.

## Provenance

The publish step runs `npm publish --provenance --access public`. Provenance records where and how
the package was built and links it back to this repository and the release workflow run. It works
with both Trusted Publishing and the token fallback, as long as the job has `id-token: write`
permission, which it does.

## Cutting a release

1. Update `version` in `package.json` to the new `X.Y.Z`.
2. Commit the bump:

   ```sh
   git add package.json
   git commit -m "Release vX.Y.Z"
   ```

3. Tag and push the tag:

   ```sh
   git tag vX.Y.Z
   git push origin main
   git push origin vX.Y.Z
   ```

Pushing the tag starts the release workflow. The publish job checks that the tag version matches
the `package.json` version and stops if they differ, so keep step 1 and the tag in sync.
