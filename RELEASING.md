# Releasing `@dwlf/charting`

Every push to `main` runs `.github/workflows/release.yml`, which runs
`semantic-release`. Commits typed `fix:`, `feat:` or carrying a breaking-change
footer produce a version; anything else produces no release. There is no manual
publish step and no release branch.

## The publish credential is not in this repository

This repo holds **no npm token**. Publishing is authorized by npm
[trusted publishing](https://docs.npmjs.com/trusted-publishers): GitHub mints a
short-lived OIDC token for the running workflow, and npm exchanges it for publish
rights on `@dwlf/charting`.

The consequences are worth knowing before you edit anything in `.github/`:

- **The record on npm names this repository and the filename `release.yml`**, matched
  exactly, and the file is expected under `.github/workflows/`. Renaming it, moving
  the job into a called workflow under a different name, or transferring the
  repository revokes publishing. Nothing fails until the next release is attempted,
  and it fails on `main`, after the merge. Update the record on npm in the same
  change.
- **`id-token: write` is part of the credential.** Removing it from the job's
  `permissions:` leaves the job with no way to authenticate at all.
- **So is `package-lock.json`, in two places that no workflow file mentions.**
  `semantic-release` resolves plugin names from its own directory first, so the
  `@semantic-release/npm` that executes is the copy in *its* dependency tree; only
  v13+ establishes the OIDC context, and pinning the plugin at the project root
  does not change which copy loads. That plugin then shells out to `npm publish`
  through execa with `preferLocal`, so the binary that authenticates is
  `node_modules/.bin/npm` from the lockfile, not the runner's Node-bundled npm, and
  only npm >= 11.5.1 can publish over OIDC. Regenerating the lockfile can move
  either one. `.github/scripts/check-trusted-publishing.mjs` runs before
  `semantic-release` and refuses the release if either has drifted, because
  otherwise both surface as an authentication error at the registry and read as a
  credential problem.
- **The Node version is about `semantic-release` itself**, which requires
  `^22.14.0 || >= 24.10.0`. Raising or lowering it does not change the npm that
  publishes.
- **A fork can never publish.** Workflows triggered from a fork cannot mint this
  repository's OIDC token, and there is no secret for them to inherit.
- Published versions carry a **provenance attestation** linking the tarball to the
  commit and workflow run that built it. This is a property of publishing over
  OIDC, and it is visible on the package page.

## Configuring it (one-time, already done)

On npmjs.com → `@dwlf/charting` → *Settings* → *Trusted Publisher* → *GitHub Actions*:

| field | value |
|---|---|
| Organization or user | `andywilliams` |
| Repository | `dwlf-charting-oss` |
| Workflow filename | `release.yml` |
| Environment | *(blank — this job declares no `environment:`)* |
| Allowed actions | allow `npm publish` (`semantic-release` calls it directly) |

Then, under *Settings* → *Publishing access*, **Require two-factor authentication
and disallow tokens**. Trusted publishing adds a credential path; that setting
closes the old one, so a leaked or lingering npm token cannot publish this package
even though the record above exists. It also stops manual `npm publish` from a
laptop, which is the trade.

## Cutting publishing off

Revoking publish rights is an **npm-side** action, not a GitHub one — deleting a
repo secret no longer does anything, because there is no secret.

1. npmjs.com → `@dwlf/charting` → *Settings* → *Trusted publisher* → remove the
   record. The next release fails at `verifyConditions`, before any tag, version
   bump or publish.
2. To stop a release already in flight, cancel the workflow run.

Anyone with `write` on this repository can cause a release, by landing a commit on
`main` or by dispatching the workflow. That is the blast radius; keep the
collaborator list to people who should be able to publish.

`id-token: write` is a **job-level** permission, so the ID-token request URL and
token are in the environment of every step in the release job, not only the one
that publishes. Anything executing there can exchange them for publish rights on
`@dwlf/charting` without involving `semantic-release` at all. The old secret was
scoped to a single step and had no such reach. The install therefore runs with
`--ignore-scripts`, which removes the install-time path; what remains is
`semantic-release` and its own dependency tree, which has to execute there for a
release to happen at all. If a dependency ever needs install scripts, split install
and build into a job without `id-token: write` rather than dropping the flag.

## Verifying a release actually shipped

`semantic-release` reporting success is not the same as consumers getting the code.
Check the artefact the registry serves:

```sh
npm view @dwlf/charting version
npm pack @dwlf/charting --registry https://registry.npmjs.org/
tar xzf dwlf-charting-*.tgz   # then inspect package/dist/
```
