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

- **The record on npm names this repository and the path `.github/workflows/release.yml`.**
  Renaming that file, moving the job into a reusable or called workflow, or
  transferring the repository revokes publishing. Nothing fails until the next
  release is attempted, and it fails on `main`, after the merge. Update the record
  on npm in the same change.
- **`id-token: write` is part of the credential.** Removing it from the job's
  `permissions:` leaves the job with no way to authenticate at all.
- **So is the Node version.** npm performs the authenticated publish and only
  npm >= 11.5.1 can do it over OIDC. Node 24 ships 11.19.0; Node 20 and 22 ship
  10.9.x. A preflight step in the workflow refuses a runner whose npm is too old
  rather than letting it reach the registry unauthenticated.
- **A fork can never publish.** Workflows triggered from a fork cannot mint this
  repository's OIDC token, and there is no secret for them to inherit.
- Published versions carry a **provenance attestation** linking the tarball to the
  commit and workflow run that built it. This is a property of publishing over
  OIDC, and it is visible on the package page.

## Configuring it (one-time, already done)

On npmjs.com → `@dwlf/charting` → *Settings* → *Trusted publisher*: GitHub Actions,
organization/repository `andywilliams/dwlf-charting-oss`, workflow file
`release.yml`, environment blank.

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

## Verifying a release actually shipped

`semantic-release` reporting success is not the same as consumers getting the code.
Check the artefact the registry serves:

```sh
npm view @dwlf/charting version
npm pack @dwlf/charting --registry https://registry.npmjs.org/
tar xzf dwlf-charting-*.tgz   # then inspect package/dist/
```
