# Contributing

Thanks for your interest in Tabletop Trainer 40K. This is a small independent hobby project, so the process is light: fork, branch, open a Pull Request, pass CI.

By contributing you agree that your contribution is licensed under the project's license ([Apache License 2.0](LICENSE)) and that you have the right to submit it. Please also read the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

You need **Node.js 22.12 or newer** (`.nvmrc` pins 24, which is what CI and the Dockerfile use) and the npm that ships with it.

```bash
# 1. Fork the repository on GitHub, then clone your fork
git clone git@github.com:<your-user>/warhammer-tabletop.git
cd warhammer-tabletop
git remote add upstream git@github.com:Dru1DD/warhammer-tabletop.git

# 2. Install exactly what package-lock.json says
npm ci

# 3. Run the app at http://localhost:5173
npm run dev
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm test` | Vitest: engine, AI, persistence, multiplayer, i18n and UI tests |
| `npm run typecheck` | `tsc -b` (strict) |
| `npm run lint` | oxlint |
| `npm run build` | typecheck plus production build into `dist/` |

CI runs `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` on every Pull Request. Run them locally before you push.

## Branches and Pull Requests

- `main` is the only long-lived branch. There is no `develop` or `staging`.
- Work on a branch in your fork, created from an up-to-date `main`, with a descriptive prefix:
  `feature/`, `fix/`, `docs/`, `refactor/` or `i18n/` (for example `fix/charge-range-rounding`, `i18n/polish-stratagems`).
- Open a Pull Request against `main`. Keep it focused: one topic per PR. Fill in the template.
- CI must be green and review conversations resolved before a PR is merged.
- PRs are merged with **Squash and merge**, so the PR title becomes the commit message on `main`. Write it as a short imperative sentence ("Fix charge range rounding"). Your branch history does not need to be tidy.
- Rebase or merge `main` into your branch if it falls behind; do not force-push over other people's work.

For anything bigger than a small fix (a new army, a new rule system, a multiplayer change), open an issue first so we can agree on the approach.

## Game rules accuracy

The trainer models Warhammer 40,000 (11th edition) but is **unofficial**. Please keep that honest:

- Do not present an approximation as an official rule. If a mechanic is simplified, say so in the code comment, in the in-game text where the player sees it, and in the docs (`docs/research.md`, the relevant army document), including what is not implemented.
- Cite the source you used (rulebook page, official download, datasheet page) in the PR and in the docs. If you could not check a rule, say that instead of guessing.
- Do not copy rules text, errata, datasheet wording, artwork, logos or photos from Games Workshop products or sites. Write rule descriptions in your own words. Stat lines and points values are factual data, but still record where they came from.
- Mechanic changes need tests. If the change alters AI-vs-AI results, see `src/game/__tests__/golden.test.ts` for how the golden-master test is meant to be refreshed (only for intentional behaviour changes, never to hide a regression).

## Code conventions

- TypeScript, strict. The rules engine in `src/game` is pure (no React, no browser APIs) and deterministic: randomness comes from the seeded roller stored in the game state. Keep it that way, and see `docs/architecture.md`.
- Game logic never matches on translated text. Use ids and flags (for example `AttackStep.meta.kind`), not labels.
- Reuse existing helpers before adding code or dependencies. A new dependency needs a reason in the PR description.
- Comments and identifiers are in English.

## Translations

User-visible text goes through `tr('English text')` and is translated in `src/i18n/ru.ts`, `uk.ts` and `pl.ts`. Read [docs/i18n.md](docs/i18n.md) first. Translations must never change internal identifiers (unit, weapon, stratagem and keyword ids), saved-game formats or the multiplayer protocol. `npm test` fails if a catalog is out of sync.

## Reporting bugs

Use the **Bug report** issue form. Helpful details: what you did, what you expected, what happened, the browser and operating system, the app version or commit, the scenario and armies, and for rules bugs the rule you believe applies and where it is written. If a game is involved, attach the save (the “Save” button) or the room's steps. Do not post personal data.

**Security problems are not bug reports.** Follow [SECURITY.md](SECURITY.md).

## Documentation

Documentation lives in `README.md` and `docs/`, in English, as Markdown. When you change behaviour, update the doc that describes it. Keep claims verifiable: link to the code or the test, and list limitations next to the feature. Check that relative links still resolve.
