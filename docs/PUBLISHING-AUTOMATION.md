# Automated publishing to the Chrome Web Store

[`.github/workflows/publish.yml`](../.github/workflows/publish.yml) builds the
store zip and uploads it whenever a GitHub Release is published. This file
covers the one-time credential setup it depends on.

Manual publishing stays available and unchanged — see [PACKAGING.md](PACKAGING.md).

## The first submission is manual

This workflow **replaces the package of an item that already exists**. It cannot
create the listing. Before it can run even once, do the initial submission by
hand in the [developer dashboard](https://chrome.google.com/webstore/devconsole):
pay the one-time developer registration fee, create the item, upload the zip from
`./scripts/pack.sh`, and fill in the store listing, privacy, and distribution
tabs from [STORE-LISTING.md](STORE-LISTING.md). None of that metadata is
reachable through the API.

Once the item exists, copy its ID out of the dashboard URL into `EXTENSION_ID`
in [`publish.yml`](../.github/workflows/publish.yml) — an ID that does not
resolve to a real item fails every upload. Automation takes over from the next
version onward.

## What the workflow does

1. Checks `extension/manifest.json` `version` matches the release tag
2. Checks the description is within the store's 132-char limit
3. Runs the unit tests
4. Builds `dist/applyverse-<version>-webstore.zip` via `scripts/pack.sh`
5. Exchanges the refresh token for an access token
6. Uploads the zip, then submits it for review

**It does not skip review.** Google still reviews every version; automation only
removes the manual build-and-drag step.

## One-time credential setup

You need three secrets. The extension ID is not secret (it is in the store URL)
and is hardcoded in the workflow.

Two of the steps below **must** happen in a browser: Google has no CLI or public
API for creating an OAuth client, and granting consent requires a sign-in by
design. Everything else is scripted.

### 1. Enable the API — CLI

The OAuth client can live in any existing project; it does not need one of its
own (and Google caps how many projects a free account may create).

```bash
gcloud auth login
gcloud config set project <PROJECT_ID>          # `gcloud projects list` to see them
gcloud services enable chromewebstore.googleapis.com
```

### 2. Create an OAuth client — browser

1. **APIs & Services → OAuth consent screen** → **External** → fill in the app
   name and your email. You do **not** need to submit it for verification, but
   **add your own Google account under Test users** — a consent screen left in
   *Testing* with no test user issues refresh tokens that expire after 7 days,
   which breaks publishing silently.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   application type **Desktop app**.
3. Under **Authorised redirect URIs**, add exactly:

   ```
   http://127.0.0.1:8910
   ```

   > The old `urn:ietf:wg:oauth:2.0:oob` ("copy this code") flow is **gone** —
   > Google shut it down in 2022 and clients created today reject it. Desktop
   > clients must use a loopback redirect, which is why the setup script runs a
   > local listener.

4. Copy the **client ID** and **client secret**.

### 3. Consent + store the secrets — CLI

```bash
./scripts/setup-publishing.sh
```

The script prompts for the client ID and secret, opens the consent screen,
catches the redirect on `127.0.0.1:8910`, exchanges the code for a refresh
token, and pipes all three values into `gh secret set`. Nothing touches disk and
nothing enters your shell history.

Verify:

```bash
gh secret list
```

You should see `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, and `CWS_REFRESH_TOKEN`.

<details>
<summary>Doing it by hand instead</summary>

Set the three secrets under **Settings → Secrets and variables → Actions**. To
get the refresh token you still need a loopback listener to catch the redirect —
the browser will not show you the code. The script exists because that part is
tedious to do manually.

</details>

**This repo is public.** GitHub never exposes secrets to workflows triggered by
pull requests from forks, and `publish.yml` only runs on `release: published`
and manual dispatch — both of which require write access. The workflow also
talks to the store API with plain `curl` rather than a third-party action, so no
external code ever handles the credentials.

## Releasing

```bash
# 1. bump the version — the store rejects a re-used version
#    edit extension/manifest.json  "version": "1.5.0"
# 2. update CHANGELOG.md
git commit -am "chore(release): v1.5.0"
git tag v1.5.0
git push origin main --tags
# 3. publish a GitHub Release for that tag — this triggers the workflow
gh release create v1.5.0 --generate-notes
```

Watch it under the repo's **Actions** tab.

## Testing without publishing

**Actions → Publish to Chrome Web Store → Run workflow**, leaving *dry run*
checked. It builds and validates but never contacts the store — useful for
confirming the tests and packaging steps pass before a real release.

## When it fails

| Symptom | Cause |
|---------|-------|
| `could not obtain an access token` | Refresh token expired (consent screen left in *Testing* with no test user, or the secret was mistyped). Redo step 3. |
| `uploadState=FAILURE` | Almost always a re-used version. Bump `manifest.json`. |
| Upload step fails with no output | `EXTENSION_ID` does not match a real item. Check it against the dashboard URL. |
| Manifest/tag mismatch error | The tag and `manifest.json` disagree — bump the manifest, retag. |
