# Open source maintenance

How the repository is run, what is already set up in Git, and what the owner must configure by hand in GitHub. Nothing here has been applied to the GitHub settings: they need owner access.

## Set up in the repository (done)

| File | Purpose |
|---|---|
| `.github/workflows/ci.yml` | CI on pull requests to `main` and on pushes to `main` |
| `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/` | PR template, bug report and feature request forms, link to private security reporting |
| `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` | Contributor, conduct and security policies |
| `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`, `docs/LICENSING.md` | License, third-party notices, licensing analysis |
| `.nvmrc`, `package.json` `engines` | Node version (24 recommended, 22.12 minimum) |

There is no `CODEOWNERS` file: there is a single maintainer and no per-area ownership, so it would add nothing. Add one when a second maintainer joins.

### CI

The workflow runs one job, **“Test, typecheck, lint, build”**, on `ubuntu-latest` with Node 24: `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. It has `contents: read` permissions only, uses no secrets and no `pull_request_target`, does not persist the checkout token, and pins both actions to commit SHAs (update them with Dependabot or by hand). It does not deploy.

**Known problem: `npm test` currently fails on `main`.** `src/game/__tests__/golden.test.ts` compares a hash of the final game state of AI-vs-AI games with a recorded table. The dice hashes, winners and scores match; only the state hash differs. It fails the same way at the commit where the table was recorded, on Node 22 and 24 and under different time zones, so it looks like the table was recorded from a state that is not in the repository rather than a regression. Fix this before requiring the check: find out what the recorded state contained, or, if the current behaviour is correct, regenerate the table as the test's header describes (`UPDATE_GOLDEN=1 npx vitest run src/game/__tests__/golden.test.ts --disableConsoleIntercept`) in its own PR.

## Manual GitHub settings (owner action required)

**Settings → Branches → Add branch ruleset (or classic protection) for `main`:**

- Require a pull request before merging; require at least 1 approval once there is a second maintainer (a solo maintainer cannot approve their own PR, so leave approvals at 0 until then).
- Require status checks to pass, and select **“Test, typecheck, lint, build”** (it appears after the first CI run). Require branches to be up to date if you want a strictly linear safety net.
- Require conversation resolution before merging.
- Block force pushes.
- Block deletion of the branch.
- Optionally require linear history (squash merge gives this anyway).

**Settings → General:**

- Pull Requests: allow **squash merging** only; set the default commit message to “Pull request title and description”; disable merge commits and rebase merging; enable “Automatically delete head branches”.
- Features: enable **Issues**, **Discussions** (for questions and ideas) and **Releases** (visible by default). Optionally disable Wikis and Projects if unused.
- Description and website: one line describing the project, plus the deployed URL if there is one.
- **Topics** (suggested): `warhammer-40k`, `tabletop`, `rules-engine`, `typescript`, `react`, `vite`, `webrtc`, `peerjs`, `konva`, `game-ai`, `training`, `fan-project`, `i18n`.

**Settings → Code security:**

- Enable **Private vulnerability reporting** (needed by `SECURITY.md` and the issue template link).
- Enable **Dependabot alerts** and, optionally, Dependabot security updates and version updates for npm and GitHub Actions.

**Settings → Actions → General:**

- Workflow permissions: read-only by default.
- Fork pull request workflows: require approval for first-time contributors.

**Other:**

- The Code of Conduct names the maintainer's GitHub profile as the contact. Replace it with a dedicated address or form if you set one up.
- Pin a “Good first issue” label and a few labelled issues to welcome contributors (`good first issue`, `help wanted`, `rules accuracy`, `i18n`).

Do not change repository visibility until the open questions in [LICENSING.md](LICENSING.md) are answered.

## Branching and merging

- `main` is the only long-lived branch; no `develop` or `staging`.
- Contributors use forks and short-lived branches named `feature/`, `fix/`, `docs/`, `refactor/` or `i18n/`.
- **Squash and merge** every PR. The PR title is the commit message, so edit it before merging. Release notes are easy to read from the history this way.

## Versioning and releases

The project follows [Semantic Versioning](https://semver.org) with tags of the form `vMAJOR.MINOR.PATCH`:

- `v0.x.0`: new features, and pre-release development where anything may change;
- `v0.x.y`: bug fixes only;
- `v1.0.0`: the first stable release, after which breaking changes require a new major version.

What counts as breaking here: the saved-game and army-code formats, the multiplayer protocol (`PROTOCOL_VERSION`), and documented behaviour. Bump `package.json` `version` in the release PR, tag the merge commit on `main` (`git tag -a v0.1.0 -m "v0.1.0"`), push the tag and publish a GitHub Release with notes. Do not create tags or releases automatically.

### Checklist for the first public release

1. Resolve the licensing questions in [LICENSING.md](LICENSING.md), especially authorship of `NalichA`'s commits and the game-data question.
2. Make `main` green: fix or regenerate the golden-master test.
3. Apply the GitHub settings above; confirm Private vulnerability reporting works.
4. Re-read the README: disclaimer, install steps, limitations and feature list against the code. Confirm the links in `README.md` and `docs/` resolve.
5. Run on a clean clone: `npm ci && npm test && npm run typecheck && npm run lint && npm run build`, then the two-browser multiplayer test from `docs/multiplayer.md`.
6. Check the app in each language (English, Ukrainian, Polish, Russian) on the start screen, a battle and the coach report.
7. Verify no secrets or personal data are in the repository or history (`git log -p` search for tokens, emails you do not want public).
8. Set `version` to `0.1.0` in `package.json`, merge, tag `v0.1.0`, publish the Release with notes and the known limitations.
9. Announce only after the above, linking README, CONTRIBUTING and SECURITY.
