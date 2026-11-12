# Licensing recommendation

This is a maintainer-facing summary, **not legal advice**. It records what the repository contains, what the project license covers, and the questions that are still open.

## Recommendation

License the **original source code and documentation** of this project under the **Apache License 2.0** ([LICENSE](../LICENSE), [NOTICE](../NOTICE)).

Why Apache-2.0 rather than MIT: it is just as permissive, adds an explicit patent grant, and its section 6 states that the license does not grant any trademark rights. That matters for a project whose subject is someone else's trademarks. It is compatible with all current dependencies, which are MIT, ISC or BSD-3-Clause.

Apache-2.0 is already in the repository (the maintainer asked for it), so this document confirms the choice rather than proposing a new one.

## What is covered, and what is not

| Content | Licensed under Apache-2.0? | Notes |
|---|---|---|
| Source code in `src/`, build and CI configuration | Yes | Original code. Subject to the authorship question below |
| Documentation in `README.md` and `docs/` | Yes | Original text. It cites external sources but does not copy them |
| Token art, board drawing, emblem (SVG and canvas code) | Yes | Original; `docs/assets.md` records that nothing is traced from Games Workshop art |
| Translations in `src/i18n` | Yes | Original wording |
| `public/favicon.svg` | No, MIT (Vite) | Listed in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md); can be replaced by an original icon |
| npm dependencies | No, their own licenses | Not stored in the repository; listed in THIRD_PARTY_NOTICES.md |
| Warhammer names, faction and unit names, weapon and ability names, rules terms | No | Games Workshop trademarks and IP. The license does not grant them; Apache-2.0 section 6 says so explicitly |
| Datasheet statistics, points values, ability effects | Unclear | See risks |

## Intellectual property risks

1. **Trademarks and names.** Faction, unit, weapon, stratagem and ability names are Games Workshop's. Nominative use to identify the game is common in fan tools, but it is not a licence. The project must keep the non-affiliation notice (README, THIRD_PARTY_NOTICES.md, in-app text) and must not use Games Workshop logos or imply endorsement.
2. **Game data.** Stat lines, points and ability effects come from third-party sites that republish Games Workshop material. Facts and game mechanics are generally treated as less protected than expressive text, but the datasheets as a whole, and the exact wording of ability text, are copyrightable. The project states that ability descriptions are written in its own words; this should be re-verified before publication, particularly `src/game/data/*` and `src/game/rules/stratagems.ts`.
3. **Games Workshop's published fan-content policy.** It is likely to ask fan projects not to use official artwork, to carry a disclaimer and not to be sold. Read the current policy at publication time and compare. The project is free and ships no official art; check that the README and the app text satisfy the disclaimer wording the policy asks for.
4. **Dependence on Wahapedia and Dakkapedia.** Links and citations are fine; do not copy their pages, tables or exported data files into the repository.
5. **User photos.** Players can attach photos of their own miniatures; they stay in the browser (`docs/assets.md`). The project does not host or distribute them.

## Open questions for the maintainer

1. **Authorship and consent.** The git history has three author identities: `Dru1DD` (including the commits shown as “Oleksandr Andriichuk”, via the same GitHub account) and `NalichA` (a different name and email, 31 of 82 commits). `NOTICE` and the README currently say "Copyright 2026 Dru1DD". Confirm that `NalichA` is the same person, or obtain that contributor's written agreement to release their work under Apache-2.0, and decide how the copyright line should read (for example "Dru1DD and contributors"). Without that, the license grant over their contributions is uncertain.
2. **Employer or third-party claims.** Confirm that nobody else (an employer, for instance) has rights over the code.
3. **Game data.** Decide whether to keep the current datasheet data as is, to ask for permission, or to reduce it to what can be defended (own wording, minimal facts).
4. **Contributor terms.** `CONTRIBUTING.md` states that contributions are licensed under Apache-2.0 (inbound = outbound, as in Apache-2.0 section 5). A Developer Certificate of Origin sign-off or a CLA is not required and not recommended for a project this size.
5. **Favicon.** Optional: replace the Vite template favicon with an original one so every shipped asset is original or has a one-line notice.

## Until these are settled

Publishing the repository publicly with the current license is reasonable only after question 1 is answered. Everything else can be handled as the project grows, but the data question is the main legal exposure and should be reviewed by someone qualified before the project is promoted widely.
