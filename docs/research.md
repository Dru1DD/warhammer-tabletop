# Rules research

Verified on **2026-10-18**. Everything here is a concise summary in my own words plus structured numbers. No rulebook text is reproduced.

## Edition

- **Warhammer 40,000, 11th edition.** Core rules were published as a free PDF and in the Warhammer 40,000 app around 2026-06-01. The Armageddon launch box followed on 2026-06-20.
- The Starter Set and the **Introductory Set** launched on 2026-07-25.
- The official downloads page (warhammer-community.com/en-gb/downloads/warhammer-40000/) was reachable. Its listing shows a Munitorum Field Manual update dated 14/10/2026, but the individual download cards could not be read as text. So rule numbers below were cross-checked against **Wahapedia's 11th-edition transcription**, a community source. Treat them as *unverified against the official PDF*.

## Introductory Set (11th edition) contents

From retailer listings and two independent unboxing reviews:

| Item | Detail |
|---|---|
| Space Marines | 1 Lieutenant (40 mm base, power sword + plasma pistol), 5 Intercessors (32 mm). One Intercessor carries an auxiliary grenade launcher, and one model is the Sergeant. |
| Orks | 1 Nob (40 mm, two-handed big choppa, with a big shoota slung on its back), 5 Boyz (32 mm). One Boy has a rokkit launcha and one has a big shoota. |
| Other | 30″×22″ double-sided paper mat, card terrain (Ork huts), range ruler, 6 dice, 6 paints, brush, 48-page handbook with lore, build/paint guides and a few teaching scenarios |

The miniatures are exclusive sculpts. The handbook's scenarios and any intro-specific datasheets **were not available online**. The simulator therefore uses the general 11th-edition datasheets with the box's loadouts.

## Datasheets used (Wahapedia 11th ed., checked 2026-10-18)

| Model | M | T | Sv | W | Ld | OC | Base |
|---|---|---|---|---|---|---|---|
| Lieutenant | 6″ | 5 | 3+ | 4 | 6+ | 1 | 40 mm |
| Intercessor / Sergeant | 6″ | 5 | 3+ | 2 | 6+ | 2 | 32 mm |
| Nob (Boyz unit) | 6″ | 5 | 5+ | 3 | 7+ | 2 | 40 mm |
| Boy | 6″ | 5 | 5+ | 1 | 7+ | 2 | 32 mm |

All weapon profiles are in `src/game/data/datasheets.ts`:
- Plasma pistol (standard / supercharge), bolt pistol, master-crafted power weapon
- Bolt rifle (Focused Fire / Saturation), grenade launcher (frag / krak), knives and fists
- Big choppa, choppa, shoota, slugga, big shoota, rokkit launcha (blasta / busta)

A search snippet gave the Lieutenant **T4**, but the datasheet page itself says **T5**. T5 is used.

### Deviations forced by the box (shown in the UI as a "training configuration")

1. **Boyz unit size.** The datasheet requires 10–20 models: 1–2 Nobs plus 9–18 Boyz. The box has 6. The game uses one unit of 6.
2. **Boyz special weapons.** The datasheet allows one per 10 models. The box has two in 6 models (big shoota and rokkit). Both are used.
3. **Nob loadout.** The datasheet's Big Choppa swap replaces both default weapons, and Big Shoota is not a Nob option. The slung big shoota is treated as decorative, so the Nob has only the Big Choppa.
4. **Lieutenant.** The power sword is mapped to *Master-crafted Power Weapon* (the Ceramite Fists swap), and the plasma pistol to the Master-crafted Bolter swap. That leaves the default bolt pistol, which is kept. This loadout is legal.
5. **Lieutenant attachment.** The Lieutenant is a *Support* character that can attach to the Intercessor Squad. In the simulator it is a **separate unit**. Attached units are an extension point.

## Mechanics: implemented vs approximated

| Mechanic | Status |
|---|---|
| Deployment: the human sets up each unit with every base wholly within their deployment zone, on the board, no overlapping bases, unit in coherency (`src/game/rules/deployment.ts`) | **Simplified.** No alternating deployment: the AI army stands at the scenario's default positions before the human deploys. No terrain or objective restrictions are applied. The default Ork positions in «Учебная стычка у аванпоста» were shifted 0.5″ right (`ox` 26 → 26.5) so every base is wholly within the zone. «Быстрый старт» skips the step and uses the default positions for both sides. |
| Turn structure: 5 rounds, Command → Movement → Shooting → Charge → Fight, roll-off for first turn | Implemented |
| Command phase: +1 CP each player; battle-shock test (2D6 ≥ Ld) for units at or below half strength or already shocked; shock persists until passed (11th change); OC becomes 0 | Implemented. CP accrue but no stratagems exist to spend them on (extension point). |
| Half-strength | **Approximation.** The exact rule (01.02.01) wasn't readable. Used: models ≤ half of starting strength, or for single models, wounds ≤ half of W. |
| Normal move ≤ M; Advance M+D6 (no charge, Assault-only shooting); Fall Back from engagement (no shooting/charging; battle-shocked → Desperate Escape hazard rolls + battle-shock roll); straight-line moves | Implemented |
| Not through enemy models; no overlapping bases; on board | Implemented |
| Engagement range 2″ (horizontal); no ending a normal move in it | Implemented. Vertical 5″ is not modelled (flat board). |
| Coherency: 2″ to at least one model and 9″ to all, edge to edge; required after moves; out-of-coherency models removed at end of turn | Implemented. Removal choice is automatic. |
| Free rotation; no pivot cost | Implicit (round bases) |
| Terrain movement (ruins/craters) | **Approximation.** Infantry move freely through terrain areas. Floors, walls and climbing are not modelled. |
| Line of sight: 1 mm line from any part of the base to any part of the target | **Approximation.** Uses 9 sample points per base. Obscuring terrain blocks unless either model is inside that terrain. Models don't block line of sight. |
| Cover: every target model is in terrain (INFANTRY) or not fully visible due to terrain; effect −1 BS | Implemented, with the same sampling approximation. One summary source claimed "+1 save"; the 11th-edition transcription says worsen BS by 1, which is used. |
| Hit roll: unmodified 1 fails, 6 is a critical hit | Implemented |
| BS/WS limits: not 1+ or 7+ | Implemented |
| Hit-roll modifier cap of ±1 | **Approximation** (the cap rule wasn't readable) |
| Wound table (2+/3+/4+/5+/6+); saves with AP and invulnerable; per-wound damage with excess lost; allocation to wounded models first, characters last | Implemented. The owner's free choice of allocation order is automated: wounded first, then fewest-W models, characters last. |
| Weapon abilities: Rapid Fire, Heavy, Assault, Close-quarters (pistols; engaged units shoot only CQ weapons at engaged enemies), Blast, Lethal Hits (non-Monster/Vehicle), Hazardous (1–2 = 1 mortal wound) | Implemented |
| Torrent, Devastating Wounds | Data fields only; no weapon in the box uses them |
| Cleave X | **Approximation:** +X attacks per 5 models in the target unit. The definition wasn't readable, so this follows the "melee Blast" description in reviews. |
| Charge: unit within 12″ that is not engaged, didn't advance or fall back; 2D6 roll first, then targets within 12″ and within the roll; must end engaged with all targets and no others; roll of 2 always fails; gains Fights First | Implemented. The charge move is **auto-placed** by the engine (greedy toward base contact), not positioned by hand. "Within the rolled distance" is read literally as edge distance ≤ roll. |
| Fight: simultaneous pile-in (3″, active player first; base-contact models stay), Fights First units first, alternate selection, consolidation 3″ (toward enemy within 3″, else toward objective) | Implemented, auto-placed |
| Which models in a unit fight | **Approximation:** models within 2″ of the target unit |
| Overrun | Not implemented |
| Objective markers: 40 mm, range 3″; control = higher total OC, tie means uncontrolled | Implemented. The "secured" (sticky) rule exists in the rules but no unit here grants it. |
| Abilities: Bolter Discipline, Tactical Precision, Ammo Runts, Tide of Muscle; Waaagh! army rule (advance re-roll; once-per-battle War Cry: riled up until end of next turn: 5+ invuln, ranged gain Assault, charge after advance) | Implemented |
| Combat Doctrines (Space Marine army rule) | **Not implemented.** The doctrines' text wasn't available. Extension point. |
| Stratagems (Insane Bravery, Heroic Intervention, Fire Overwatch, Crushing Impact…), Hidden, attached units, vertical terrain, reserves/Ingress | Not implemented (extension points) |
| Mission / VP scoring | **Unofficial training rule** (labelled in the UI): from round 2, 5 VP per controlled objective in your Command phase. Win on VP after round 5, or by wiping out the enemy. Official mission rules were not used. |

## Balance note

With these datasheets the box is lopsided. Intercessor bolt rifles (S6, AP-1, D2, Rapid Fire, 24″) kill one-wound, 5+-save Boyz very efficiently, and on a 30″ board they reach almost everywhere after one move.

Standard AI vs standard AI, 40 seeds per scenario (2026-10-18):

| Scenario | Space Marines win | Orks win | Average end round |
|---|---|---|---|
| Учебная стычка у аванпоста | 40 | 0 | 1.7 |
| Переулок в руинах | 35 | 5 | 1.6 |

Varying the Ork AI's `damageTaken` weight (0.2 → 3) changes its behaviour: charges across the 40 games ranged from 41 down to 0 in the ruins scenario. It does not change the overall result. So the imbalance comes mainly from the profiles and board size, not from the AI ignoring cover. Each attack step is unit-tested. A fairer training mode would need the handbook's own scenarios.

## Sources (all checked 2026-10-18)

- Official: https://www.warhammer-community.com/en-gb/downloads/warhammer-40000/ (downloads index; cards not text-readable)
- Official: https://warhammer40000.com/ (rules hub, referenced)
- Official: https://www.warhammer-community.com/en-gb/terms-of-use/ and https://www.warhammer.com/en-GB/legal (IP/terms)
- Core rules transcription: https://wahapedia.ru/wh40k11ed/the-rules/core-rules/
- Datasheets: https://www.wahapedia.ru/wh40k11ed/factions/space-marines/Lieutenant · https://www.wahapedia.ru/wh40k11ed/factions/space-marines/Intercessor-Squad · https://wahapedia.ru/wh40k11ed/factions/orks/Boyz
- Rules overview: https://spruesandbrews.com/2026/06/01/warhammer-40000-11th-edition-core-rules-deep-dive/
- Box contents: https://spruesandbrews.com/2026/07/11/warhammer-40000-introductory-set-unboxing-review-40k-11th-edition/ · https://taleofpainters.com/2026/07/every-11th-edition-warhammer-40k-starter-set-unboxed-reviewed/ · https://www.fairgamestore.com/warhammer-40k-introductory-set-11e.html · https://www.loadeddice.uk/blogs/blog/warhammer-40k-11th-edition-starter-sets
