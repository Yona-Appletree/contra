# Date-based versioning and GitHub Pages as the first host

Date: 2026-09-13
Status: accepted

## Context

The demo (plan.md AC10) needs a public URL that always serves current
`main`, with a version string a viewer or the director can point to. The
repo is solo-maintained (one committer, no review requirement), trunk-based,
and the plan's milestones merge on green CI with no separate release step.
`fly.io` hosting is out of scope until M16; until then the app is static
(no backend), so GitHub Pages is a free, zero-config host for it.

## Decision

- **Trunk-based, squash merges.** Every milestone lands on `main` through a
  pull request; there is no long-lived release branch. A branch-protection
  ruleset on `main` requires the `CI` status check and a pull request (zero
  required approvals, since the repo is solo), and forbids force pushes.
- **Date versioning, tagged on merge.** Every push to `main` is tagged
  `vYYYY.MM.DD-N` in `America/Los_Angeles`, where `N` is one more than the
  highest `N` already tagged for that date (`scripts/tag-next-version.sh`).
  This gives every deploy a unique, human-legible, chronologically sortable
  version with no manual bump step and no semver judgement call — every
  merge is a release.
- **GitHub Pages, deployed from a workflow.** `main-push.yml` builds
  `apps/web` with `VITE_APP_VERSION` set to the tag just created and deploys
  it with `actions/upload-pages-artifact` / `actions/deploy-pages`. Pages is
  configured with build type `workflow` (not "deploy from a branch"), so the
  built `dist/` — including the copied `spikes/**` — is what ships, never
  raw source. The version string renders in the app footer so a viewer (or
  the director, checking a screenshot) can tell which commit they are
  looking at.
- **CI gates every merge.** `ci.yml` runs `pnpm validate` (format, dependency
  arrows, lint, typecheck, unit tests, build, golden tests) on every pull
  request and on every push to `main`, as the job named `CI` that the
  ruleset requires.

## Consequences

- No manual release process: merging to `main` is the release.
- The version tag is created by CI, not by a person, so `tag-next-version.sh`
  must run with a bot git identity (`CI=true`) and push the tag itself
  (`contents: write`).
- Because Pages serves the build artifact, the site can never serve stale or
  half-built source; a failed build simply does not deploy.
- Moving off Pages later (M16, `fly.io`) only changes `deploy-pages` in
  `main-push.yml` — versioning and the `CI` gate are unaffected.
