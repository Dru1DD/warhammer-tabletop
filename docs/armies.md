# Armies: Tyranids, Necrons, Aeldari

> The sixth army, **Adeptus Mechanicus** (added 2026-11-09), has its own document: [mechanicus.md](mechanicus.md). Its balance numbers are in the section [Adeptus Mechanicus balance](#adeptus-mechanicus-balance) at the end of this file. The text below covers the Tyranids, Necrons and Aeldari.

Three complete armies play next to the original Space Marines and Orks (and the Adeptus Mechanicus) on the 44″×30″ “Combat Patrol” board. Any two different armies can fight each other (15 pairings with the Mechanicus, either seating). Small 30″×22″ boards keep the two Introductory Set armies only.

## Sources and edition

Everything targets **11th edition**, like the rest of the project (see [research.md](research.md)). Datasheets were read from Wahapedia's 11th-edition transcription on **2026-11-09**, the same community source the project already uses. It is *not* the official PDF, so treat the numbers as unverified against GW's own files.

- Tyranids: [Hive Tyrant](https://wahapedia.ru/wh40k11ed/factions/tyranids/Hive-Tyrant) · [Termagants](https://wahapedia.ru/wh40k11ed/factions/tyranids/Termagants) · [Hormagaunts](https://wahapedia.ru/wh40k11ed/factions/tyranids/Hormagaunts) · [Tyranid Warriors With Ranged Bio-weapons](https://wahapedia.ru/wh40k11ed/factions/tyranids/Tyranid-Warriors-With-Ranged-Bio-weapons)
- Necrons: [Overlord](https://wahapedia.ru/wh40k11ed/factions/necrons/Overlord) · [Necron Warriors](https://wahapedia.ru/wh40k11ed/factions/necrons/Necron-Warriors) · [Skorpekh Destroyers](https://wahapedia.ru/wh40k11ed/factions/necrons/Skorpekh-Destroyers) · [Canoptek Scarab Swarms](https://wahapedia.ru/wh40k11ed/factions/necrons/Canoptek-Scarab-Swarms)
- Aeldari: [Farseer](https://wahapedia.ru/wh40k11ed/factions/aeldari/Farseer) · [Guardian Defenders](https://wahapedia.ru/wh40k11ed/factions/aeldari/Guardian-Defenders) · [Dire Avengers](https://wahapedia.ru/wh40k11ed/factions/aeldari/Dire-Avengers) · [Windriders](https://wahapedia.ru/wh40k11ed/factions/aeldari/Windriders)
- Core rules (weapon abilities §24, FLY §21.03, healing §02.02.04, battle-shock §01.07): [core rules transcription](https://wahapedia.ru/wh40k11ed/the-rules/core-rules/)

`src/game/__tests__/armyData.test.ts` pins every characteristic and weapon profile below, so a typo in the data fails a test.

## Training compositions and legality

All four requested units exist in 11th edition. Two compositions needed a transparent adjustment; the rest are legal as listed. Points were not used (the project has no points system).

| Army | Requested | Built | Legality note |
|---|---|---|---|
| Tyranids | 1 Hive Tyrant | 1 Hive Tyrant, default loadout (monstrous bonesword and lash whip + monstrous scything talons) | Legal. The Tyrant has no ranged weapon in the default loadout; the cannons are in the data (`heavyVenomCannon`, `stranglethornCannon`) but not equipped. |
| | 10 Termagants | 10 Termagants: 7 fleshborers, 1 shardlauncher, 1 spike rifle, 1 strangleweb | Legal: 10 is the minimum; each special weapon is allowed once per 10 models. |
| | 10 Hormagaunts | 10 Hormagaunts | Legal (10–20). |
| | 3 Tyranid Warriors | 1 Tyranid Prime + 2 Warriors with Ranged Bio-weapons: devourer, venom cannon, barbed strangler | **Adjusted**: the datasheet unit is *1 Tyranid Prime + 2–5 Warriors* (3–6 models), so 3 models is the minimum legal unit. One venom cannon and one barbed strangler per 3 models are both allowed. The page gives one characteristics row for the whole unit, so Prime and Warrior share the profile. |
| Necrons | 1 Overlord | 1 Overlord: tachyon arrow + Overlord's blade (default) | Legal. |
| | 10 Necron Warriors | 10 Necron Warriors with gauss flayers | Legal (10–20). |
| | 3 Skorpekh Destroyers | 3 Skorpekh Destroyers, no Plasmacyte | Legal (3–6). The optional Plasmacyte is not taken. |
| | 3 Canoptek Scarab Swarms | 3 Canoptek Scarab Swarms | Legal (3–6). |
| Aeldari | 1 Farseer | 1 Farseer: Eldritch Storm, shuriken pistol, witchblade (default) | Legal. |
| | 10 Guardian Defenders | 10 Guardian Defenders **+ 1 Heavy Weapon Platform** (missile launcher) | **Adjusted**: the datasheet unit is 10 Defenders *and* 1 platform (11 models). The platform is part of the unit. |
| | 5 Dire Avengers | 1 Dire Avenger Exarch + 4 Dire Avengers (shuriken pistol + diresword on the Exarch) | Legal: 5 models is the minimum (1 Exarch + 4–9). |
| | 3 Windriders | 3 Windriders: twin shuriken catapult, scatter laser, shuriken cannon | Legal (3–6). |

Not taken (optional wargear): Aspect Shrine token, shimmershield, Plasmacyte, singing spear, resurrection orb. Their weapon profiles are in the data where they are weapons.

Leaders and Support characters join units before the battle ([leaders.md](leaders.md)).

## Datasheets as implemented

M / T / Sv / W / Ld / OC (invulnerable save) · base. Full weapon profiles are in `src/game/data/{tyranids,necrons,aeldari}.ts`.

| Unit | M | T | Sv | W | Ld | OC | Inv | Base |
|---|---|---|---|---|---|---|---|---|
| Hive Tyrant | 8″ | 10 | 2+ | 10 | 7+ | 3 | 4+ | 60 mm |
| Termagant | 6″ | 3 | 5+ | 1 | 8+ | 2 | – | 28.5 mm |
| Hormagaunt | 10″ | 3 | 5+ | 1 | 8+ | 2 | – | 28.5 mm |
| Tyranid Prime / Warrior | 6″ | 5 | 4+ | 3 | 7+ | 2 | – | 50 mm |
| Overlord | 5″ | 5 | 2+ | 6 | 6+ | 1 | 4+ | 40 mm |
| Necron Warrior | 5″ | 4 | 4+ | 1 | 7+ | 2 | – | 32 mm |
| Skorpekh Destroyer | 8″ | 6 | 3+ | 3 | 7+ | 2 | – | 50 mm |
| Canoptek Scarab Swarm | 10″ | 2 | 6+ | 4 | 8+ | 0 | – | 40 mm |
| Farseer | 7″ | 3 | 6+ | 4 | 6+ | 1 | 4+ | 25 mm |
| Guardian Defender | 7″ | 3 | 4+ | 1 | 7+ | 2 | – | 28.5 mm |
| Heavy Weapon Platform | 7″ | 3 | 4+ | 2 | 7+ | 0 | – | 40 mm |
| Dire Avenger | 7″ | 3 | 4+ | 1 | 6+ | 1 | – | 28.5 mm |
| Dire Avenger Exarch | 7″ | 3 | 4+ | 2 | 6+ | 1 | 5+ | 28.5 mm |
| Windrider | 14″ | 4 | 4+ | 2 | 7+ | 2 | 6+ | 32 mm |

## Rules abstractions

The new armies needed mechanics the engine did not have. Each is a reusable rule, not a faction special case, and each has tests (`weaponAbilities.test.ts`, `factionRules.test.ts`).

| Mechanic | Used by | Implementation |
|---|---|---|
| **Twin-linked**: re-roll failed wound rolls | Hive Tyrant bonesword, spinefists, Warriors, Windriders | `combat/attack.ts` wound step |
| **Extra Attacks**: swing in addition to the other melee weapon | Hive Tyrant scything talons | `meleeWeaponsOf` (first normal weapon + every Extra Attacks weapon) |
| **Devastating Wounds**: a critical wound = mortal wounds equal to D, after normal damage, no save | Overlord's blade, voidscythe, strangleweb | `attack.ts` (this keyword existed in the data but did nothing before) |
| **Sustained Hits X**, **Lethal Hits**, **Anti-X Y+**, **Psychic** (ignore BS/hit modifiers and cover), **One Shot** | scatter laser, Bladestorm; gauss, shuriken cannon; witchblade; Farseer; tachyon arrow | `attack.ts`, `shootPlan`; One Shot is remembered per model in `UnitState.spent` |
| **Re-roll hit rolls** (1s, or all misses) | Swift Demise (all misses vs the closest target), Whirling Onslaught (all misses after a charge) | `AttackContext.rerollHits` |
| **FLY** ("take to the skies": −2″, pass over models and terrain) | Scarab Swarms, Windriders | `move.fly`, `moveProblem`/`planMove`; SWARM counts as INFANTRY for terrain and cover |
| **Synapse**: 3D6 battle-shock rolls and +1 Strength on melee attacks within 6″ of a SYNAPSE unit | all Tyranids | `inSynapseRange`, `leadershipRoll`, `meleeSetup` |
| **Shadow in the Warp**: once per battle, every enemy unit tests battle-shock (−1 within 6″ of Synapse) | Tyranids | command `callShadow`, `PlayerState.shadowUsed` |
| **Onslaught** aura: Assault + Lethal Hits for friendly Tyranids within 6″ of the Tyrant | Hive Tyrant | `inOnslaught` in `shootPlan` |
| Charge after Advance / shoot and charge after Fall Back | Bounding Leap / Adaptable Predators | `canChargeAfterAdvance`, `canActAfterFallBack` (Waaagh! uses the same hook) |
| **Reanimation Protocols**: at the end of your Command phase heal D3 wounds, then revive models with 1 wound (never CHARACTER, never above starting strength) | all Necrons | `rules/heal.ts` (`healUnit`, `reviveSpot`), `reanimate`; Their Number is Legion re-rolls a D3 of 1 |
| **Self-destruction**: at the start of the Fight phase an engaged swarm loses a model; D6 (+1 vs VEHICLE): 2–5 = D3 mortal wounds, 6+ = 3 | Scarab Swarms | `selfDestruction` in `enterPhase('fight')` |
| **Chittering Swarm**: −1 OC (min 1) for enemy models engaged with the swarm | Scarab Swarms | `objectiveLevels` |
| **Implacable Resilience**: −1 Damage (min 1) | Overlord | `defenceMods` |
| **Battle Focus**: 2 tokens per battle round; **Swift as the Wind** spends one for +2″ | Aeldari | `PlayerState.focus`, `move.swift` |
| **Guide**: mark an enemy unit within 18″ in view; friendly AELDARI get +1 to hit against it until your next Command phase | Farseer | command `guide`, `PlayerState.guide` |
| **Bladestorm**: Sustained Hits 1 against a target within half range | Dire Avengers | per-model group in `shootPlan` |
| **Crewed Platform**: platforms die with the last Guardian Defender | Guardian Defenders | `enforceCrews` |

Interpretation choices (the transcription does not say, or the choice is the player's):

- **3D6 for battle-shock** (Synapse): the rule text only says "3D6 instead of 2D6". The sum of all three dice is used.
- **Shadow in the Warp**: a unit that passes keeps its current status (a passing roll does not cure an already shocked unit).
- **Their Number is Legion**: the simulator re-rolls a D3 result of 1 (the player's choice, automated).
- **Self-destruction** is optional in the rules; the simulator uses it automatically at the start of every Fight phase while the swarm has at least 2 models.
- **Guide** may be used at any point of your Movement phase, not only at its very end.
- **Melee weapon choice**: a model with several non-Extra-Attacks melee weapons uses the first one listed (the Exarch's diresword).

## Not implemented (deliberately, never replaced by an unrelated effect)

| Ability | Why |
|---|---|
| Skulking Horrors (Termagants), Fade Back, Opportunity Seized, Flitting Shadows, Sudden Strike, Star Engines (Battle Focus manoeuvres), Fleet of Foot | Reactive moves during the opponent's turn need an interrupt mechanism the engine does not have (same reason Fire Overwatch is missing). Swift as the Wind is a normal-turn effect and is implemented. |
| Will of the Hive Mind, My Will Be Done | They reduce a stratagem's CP cost; there are no stratagems. |
| Branching Fates | Not implemented yet; the Farseer does lead a unit ([leaders.md](leaders.md)). |
| Shadow in the Warp in the *opponent's* Command phase | A command from the non-active player would break the "who owns the decision" rule; it is available in your own Command phase only. |
| Plasmacyte, Aspect Shrine tokens, shimmershield, Resurrection Orb | Optional wargear that was not taken in the training lists. |

Each of these abilities is listed in the unit card with a "[Not implemented …]" note.

## AI behaviour per army

All armies use the same utility AI (`ai/ai.ts`) with faction weights and a few hooks. Marines and Orks keep their exact original numbers (the golden-master test pins them).

| Army | Style |
|---|---|
| Tyranids | Swarm: aggressive (closes in, `attackOpportunity` 1.6), cares little about losses, bonus for staying in Synapse Range, calls Shadow in the Warp from round 2 when at least two healthy enemy units are on the board. Hormagaunts and the Tyrant hunt the enemy. |
| Necrons | Methodical gunline: values objectives and survival, shoots first; Skorpekh Destroyers and Scarab Swarms are melee hunters. Reanimation makes losses cheaper (the AI does not need to retreat). |
| Aeldari | Fragile hit-and-run shooters: high survival and cover weights, falls back from a lost melee, uses Swift as the Wind only when the move needs the extra 2″, flies when the flying path scores better, and uses Guide at the end of the Movement phase on the nearest visible enemy. |

**Charging next turn.** Aggressive armies (Orks, Tyranids, and the hunter units of the others) also value a charge they could make **next turn**. The unit first makes its normal move, then 2D6 has to cover the rest. The value is weighted by `NEXT_TURN_CHARGE` (0.5) against a charge possible now.

**Capped risk.** The risk of a position is capped at the wounds the unit has left. Summed over every enemy gun, it used to exceed what a big swarm can lose.

**Why.** Before this, a melee swarm far from the enemy saw only that risk and no gain in closing in. In a battle on 12.11.2026 the Hormagaunts stood in cover for two turns and never charged.

**Effect** (AI-vs-AI, 3 seeds each):
- Tyranids against Aeldari win faster;
- Orks against Space Marines now lose by round 3 instead of rounds 4–5: they run into the guns rather than wait.

The golden and aiEquivalence fingerprints were re-recorded for this change.

## Tests

- `armyData.test.ts`: every characteristic and weapon profile, compositions and loadout limits, legal deployment of every army in either seat for all 20 ordered pairings, a token and an original portrait for every model.
- `weaponAbilities.test.ts`, `factionRules.test.ts`: each abstraction above against scripted dice.
- `armyBattles.test.ts`: complete AI-vs-AI battles for all 10 pairings through the real match pipeline (`aiProposal` → `submit`): every command legal, a full turn each, attacks with dice, casualties, objective VP, and replay of a saved history to a byte-identical final state.
- `ui/armies.test.tsx`: the selection screen lists the real composition; each of the five armies is deployed and played by a human through the store for two rounds against the AI, autosaved and reloaded.

## Points

Unit costs live in `src/game/data/points.ts`: Munitorum Field Manual values as listed by Dakkapedia (updated 2026-06-17), first-unit price only. A unit size the Field Manual does not list (the duel's 6 Boyz, 3 Kastelan Robots) is pro-rated from the smallest bracket and shown with «≈». The start screen shows each unit's cost, the army total and a warning when one army is 25% or more above the other. The unit card shows the unit cost and an indicative cost per model.

| Army (Combat Patrol) | Points |
|---|---|
| Adeptus Mechanicus | ≈ 865 |
| Space Marines | 475 |
| Tyranids | 385 |
| Orks | 335 |
| Aeldari | 315 |
| Necrons | 295 |

## Army builder

The Orks have four more units for army lists (Warboss, Nobz, Gretchin, Kommandos): see [orks.md](orks.md). So do the Space Marines (Captain, Hellblasters, Infernus, Bladeguard Veterans): see [marines.md](marines.md), the Tyranids (Winged Prime, Zoanthropes, Carnifexes, Barbgaunts): see [tyranids.md](tyranids.md), the Necrons (Royal Warden, Immortals, Lychguard, Canoptek Wraiths): see [necrons.md](necrons.md), and the Aeldari (Autarch, Rangers, Wraithguard, Swooping Hawks): see [aeldari.md](aeldari.md).

The start screen has an army builder for both sides (yours and the AI's). Each faction keeps its own list in this browser.

- **Training roster**: the scenario's training roster, no points limit. This is the old behaviour and the default.
- **Preset 500 … Preset 2500**: a ready-made list for the limit (500, 1000, 1500, 2000 or 2500 points). A preset is loaded into the list and can then be edited: change a unit size, remove a unit, add one.
- **Rules checked** (`listProblems` in `src/game/army/armyList.ts`): only unit sizes the Field Manual lists, at most 3 copies of a datasheet (6 for BATTLELINE), total within the limit. Later copies of some units cost more (`POINTS_LATER` in `points.ts`). The start buttons stay disabled while a list breaks a rule.
- **Board**: own lists play on “Combat Patrol” (44″×30″) or on the 44″×60″ board. Picking a preset switches to Combat Patrol, and the duel boards are disabled while a list is in use. Combat Patrol has room for lists up to 1000 points (`maxPoints` in `scenarios.ts`): a bigger list moves the battle to the 44″×60″ board, and the builder says so. Online battles take each player's own list too (see `docs/multiplayer.md`).
- **Loadouts** come from `COMPOSITION`: the leader model, then a repeating pattern, so a 10-model unit carries twice the special weapons of a 5-model one. Wargear choices are not in the builder yet.
- **My rosters and army code** (`src/game/army/armyCode.ts`, `src/ui/ArmyCodes.tsx`):
  - **My rosters.** Named lists per faction, saved in this browser (`wh40k-training-saved-armies`). The same name overwrites, the newest comes first, ✕ deletes.
  - **📋 Army code.** Copies the list as text, `WH40K1.` + base64url of `{f, l, u: [[datasheetId, size, loadout?]…]}`, to send to a friend. The loadouts are included.
  - **📥 Paste code.** Loads such a code. Spaces and line breaks from a messenger are ignored. A code of another faction, a cut code, or one with units this version does not have is refused with the reason.
- **Set-up** (`src/game/army/placement.ts`): every unit is placed legally in its deployment zone with the same check as the deployment step. The bulkiest units go first from the front line back. Characters go last, next to a unit they can lead. Each unit first tries its densest formation; when that no longer fits the space left (big lists, narrow zones such as Sweeping Engagement), it tries shallower ones, down to a single line. If a list still does not fit, the start screen says which unit has no room.

| Preset | 500 | 1000 | 1500 | 2000 | 2500 |
|---|---|---|---|---|---|
| Space Marines | 480 | 980 | 1500 | 1985 | 2485 |
| Orks | 495 | 975 | 1495 | 1995 | 2465 |
| Tyranids | 480 | 1000 | 1480 | 2000 | 2500 |
| Necrons | 495 | 990 | 1475 | 1985 | 2500 |
| Aeldari | 480 | 980 | 1460 | 1985 | 2445 |
| Adeptus Mechanicus | 490 | 970 | 1495 | 1985 | 2485 |

**Points limits and the 11th edition rules.** The Core Rules (Muster Armies, 25.03, Wahapedia) have two battle sizes: Incursion, 1000 points, and Strike Force, 2000 points. The Mission Deck 2026-27 plays every mission on a 44″×60″ battlefield. 1500 and 2500 are not official sizes: 1500 is a common size for a shorter game, 2500 a bigger one for players with more models. The builder allows 3 units of a datasheet (6 BATTLELINE) at every limit, which is the Strike Force rule; Incursion allows 2 (4 BATTLELINE), which the builder does not check yet.

### Presets over 1000 points

They play on the 44″×60″ board (see [strike-force.md](strike-force.md)). A number in brackets is the unit size; “2 ×” means two units.

**Space Marines**

- **1500 (1500 points):** Captain, 2 × Lieutenant, 2 × Intercessor Squad (10), Assault Intercessor Squad (10), Hellblaster Squad (10), 2 × Infernus Squad (5), Bladeguard Veteran Squad (6), Redemptor Dreadnought, Predator Annihilator.
- **2000 (1985 points):** Captain, 3 × Lieutenant, 2 × Intercessor Squad (10), Assault Intercessor Squad (10), Hellblaster Squad (10), Hellblaster Squad (5), Infernus Squad (10), Bladeguard Veteran Squad (6), 2 × Redemptor Dreadnought, 2 × Predator Annihilator.
- **2500 (2485 points):** 2 × Captain, 2 × Lieutenant, 3 × Intercessor Squad (10), 2 × Assault Intercessor Squad (10), Hellblaster Squad (10), Hellblaster Squad (5), Infernus Squad (10), Infernus Squad (5), Bladeguard Veteran Squad (6), Bladeguard Veteran Squad (3), 2 × Redemptor Dreadnought, 2 × Predator Annihilator.

**Orks**

- **1500 (1495 points):** 2 × Warboss, 3 × Boyz (20), Nobz (10), Nobz (5), Kommandos (10), Gretchin (20), 2 × Deff Dread, Battlewagon.
- **2000 (1995 points):** 2 × Warboss, 5 × Boyz (20), Nobz (10), Nobz (5), Kommandos (10), 2 × Gretchin (20), 3 × Deff Dread, Battlewagon.
- **2500 (2465 points):** 3 × Warboss, 6 × Boyz (20), Nobz (10), Nobz (5), 2 × Kommandos (10), Gretchin (20), Gretchin (10), 3 × Deff Dread, 2 × Battlewagon. Each Warboss leads a Boyz mob, so the mobs take more room: the second Gretchin unit has 10 models, or the army does not fit the Crucible zone.

**Tyranids**

- **1500 (1480 points):** Hive Tyrant, Winged Tyranid Prime, Tyranid Warriors With Ranged Bio-weapons (6), Termagants (20), 2 × Hormagaunts (20), Zoanthropes (3), Carnifexes (2), Barbgaunts (10), Barbgaunts (5), Exocrine, Tyrannofex.
- **2000 (2000 points):** 2 × Hive Tyrant, 2 × Winged Tyranid Prime, Tyranid Warriors With Ranged Bio-weapons (6), 2 × Termagants (20), Hormagaunts (20), Zoanthropes (6), Carnifexes (2), Barbgaunts (10), Barbgaunts (5), Exocrine, 2 × Tyrannofex.
- **2500 (2500 points):** 2 × Hive Tyrant, 2 × Winged Tyranid Prime, 2 × Tyranid Warriors With Ranged Bio-weapons (6), 2 × Termagants (20), 2 × Hormagaunts (20), Zoanthropes (6), 2 × Carnifexes (2), Barbgaunts (10), 2 × Exocrine, 2 × Tyrannofex.

**Necrons**

- **1500 (1475 points):** Overlord, Royal Warden, Necron Warriors (20), 2 × Immortals (10), Lychguard (10), Canoptek Wraiths (3), Skorpekh Destroyers (6), Canoptek Scarab Swarms (3), 2 × Doomsday Ark.
- **2000 (1985 points):** 2 × Overlord, Royal Warden, 2 × Necron Warriors (20), 2 × Immortals (10), Immortals (5), 2 × Lychguard (10), Canoptek Wraiths (3), Skorpekh Destroyers (6), Canoptek Scarab Swarms (3), 2 × Doomsday Ark.
- **2500 (2500 points):** 2 × Overlord, 2 × Royal Warden, 2 × Necron Warriors (20), 3 × Immortals (10), 2 × Lychguard (10), Canoptek Wraiths (6), Skorpekh Destroyers (6), Canoptek Scarab Swarms (6), 3 × Doomsday Ark.

**Aeldari**

- **1500 (1460 points):** Farseer, Autarch, 3 × Guardian Defenders (11), Rangers (10), 2 × Wraithguard (5), Swooping Hawks (5), Dire Avengers (10), Dire Avengers (5), Windriders (6), Fire Prism.
- **2000 (1985 points):** 2 × Farseer, Autarch, 3 × Guardian Defenders (11), Rangers (10), Rangers (5), 2 × Wraithguard (5), Swooping Hawks (10), 2 × Dire Avengers (10), Windriders (6), Windriders (3), 2 × Fire Prism.
- **2500 (2445 points):** 2 × Farseer, 2 × Autarch, 4 × Guardian Defenders (11), Rangers (10), 2 × Rangers (5), 3 × Wraithguard (5), Swooping Hawks (10), 2 × Dire Avengers (10), 2 × Windriders (6), 2 × Fire Prism.

**Adeptus Mechanicus**

- **1500 (1495 points):** Tech-Priest Dominus, Tech-Priest Manipulus, 2 × Skitarii Rangers (10), 2 × Skitarii Vanguard (10), Kataphron Breachers (3), 2 × Kataphron Destroyers (3), Sicarian Infiltrators (5), Kastelan Robots (2), 2 × Onager Dunecrawler, Ironstrider Ballistarii, Serberys Sulphurhounds (3).
- **2000 (1985 points):** Tech-Priest Dominus, Tech-Priest Manipulus, 3 × Skitarii Rangers (10), 2 × Skitarii Vanguard (10), 2 × Kataphron Breachers (3), 2 × Kataphron Destroyers (3), 2 × Sicarian Infiltrators (5), Kastelan Robots (2), 2 × Onager Dunecrawler, Ironstrider Ballistarii (2), Corpuscarii Electro-Priests (5), Serberys Sulphurhounds (6).
- **2500 (2485 points):** Tech-Priest Dominus, 2 × Tech-Priest Manipulus, 4 × Skitarii Rangers (10), 3 × Skitarii Vanguard (10), 2 × Kataphron Breachers (3), 3 × Kataphron Destroyers (3), Sicarian Infiltrators (5), 2 × Kastelan Robots (2), 2 × Onager Dunecrawler, Ironstrider Ballistarii (2), Corpuscarii Electro-Priests (10), Serberys Sulphurhounds (6).

**Known limitation: AI speed.** The AI's movement planning and line-of-sight checks grow with the number of models. Measured in Node on the first round:

| Armies | Average AI decision | Slowest decision |
|---|---|---|
| Training rosters | 0.5 s | 2.5 s |
| 500-point presets | 1.8 s | 25 s |
| 1000-point presets | 2.7 s | 15.6 s |

At bigger limits a whole AI turn takes longer. Measured in Node on 2026-11-13, standard AI, Adeptus Mechanicus vs Orks on Hammer and Anvil, the first two battle rounds: an AI turn takes 8–13 s with the 1000-point presets, 20–49 s at about 2000 points and 14–50 s at about 2500 points; the slowest single decision is 2.9 s, 4.8 s and 6.0 s. The builder warns about it for lists over 1000 points.

The browser freezes while the AI thinks. Speeding the AI up is separate work.

## Balance observations

Measured on 2026-11-09: the tactical (**“Standard”**) AI plays both sides, “Combat Patrol”, **seeds 1–4, both seatings** of every pairing = **80 battles** (8 per pairing, 32 per army). Reproduce with
`BALANCE_SIM=1 npx vitest run src/game/__tests__/balance.test.ts --disableConsoleIntercept` (about 11 minutes; `BALANCE_SEEDS=1,2` for a quick run). This is observation only: nothing was tuned.

| Pairing (A vs B) | Wins A : B : draws | Avg end round | Avg VP (A : B) | Avg models lost (A / B) |
|---|---|---|---|---|
| Space Marines vs Orks | 8 : 0 : 0 | 4.4 | 22.5 : 11.9 | 3.6 / 31.0 |
| Space Marines vs Tyranids | 7 : 1 : 0 | 3.8 | 14.4 : 10.0 | 6.0 / 23.8 |
| Space Marines vs Necrons | 8 : 0 : 0 | 4.6 | 28.1 : 9.4 | 3.9 / 16.5 |
| Space Marines vs Aeldari | 8 : 0 : 0 | 4.6 | 28.1 : 11.9 | 1.8 / 19.4 |
| Orks vs Tyranids | 3 : 5 : 0 | 4.6 | 18.8 : 13.1 | 28.3 / 22.9 |
| Orks vs Necrons | 8 : 0 : 0 | 3.6 | 21.3 : 5.6 | 10.0 / 17.0 |
| Orks vs Aeldari | 6 : 1 : 1 | 4.9 | 23.1 : 11.3 | 23.8 / 18.3 |
| Tyranids vs Necrons | 8 : 0 : 0 | 4.5 | 19.4 : 10.6 | 19.5 / 17.0 |
| Tyranids vs Aeldari | 6 : 1 : 1 | 5.0 | 20.0 : 13.8 | 22.9 / 18.1 |
| Necrons vs Aeldari | 6 : 2 : 0 | 4.6 | 21.3 : 15.0 | 8.5 / 15.9 |

| Army | Wins | Games | Win rate |
|---|---|---|---|
| Space Marines | 31 | 32 | 97% |
| Tyranids | 20 | 32 | 63% |
| Orks | 17 | 32 | 53% |
| Necrons | 6 | 32 | 19% |
| Aeldari | 4 | 32 | 13% |

What the numbers do and do not say:

- **No seat bias.** The side that took the first turn won 44 of 80 (55%) and the west seat won 44 of 80 (55%); both are close to a coin flip. East-side positions, the board flip of the art and the AI's own-edge logic do not distort results. (In the earlier one-seed smoke run the west army won every game only because seed 1 gives the west army the first turn in all ten pairings.)
- **The order is Marines > Tyranids > Orks > Necrons > Aeldari** for *this AI, these lists and this scoring*. It is not a statement about the real game: the lists are training compositions, not points-matched armies (24 Tyranid models against 17 Marines, for example), there are no stratagems, and the reactive abilities listed above are missing.
- **Marines** win 97% for the same reason as in the two-army setup (24″ bolt rifles with Rapid Fire kill 1-wound models efficiently on a board this size).
- **Tyranids** are the strongest new army: numbers, 10″ Hormagaunts that charge after advancing, and Synapse (+1 Strength, safe battle-shock). They beat Orks 5–3 and take a game off the Marines.
- **Necrons and Aeldari lose most games.** Against the Marines they lose almost their whole army (16.5 of 17 and 19.4 of 20 models on average) while the Marines lose 4 and 2. Likely causes, **not tested**: 1-wound, 4+ save infantry (Necron Warriors, Guardians, Dire Avengers) die quickly to 24″ Marine fire, and neither Reanimation (D3 wounds per turn) nor Aeldari mobility compensates with these AI weights. Between themselves the Necrons beat the Aeldari 6–2.
- **Sample size.** Eight battles per pairing give wide error bars (a 6–2 result is compatible with a 50/50 matchup); only the army totals and the extreme pairings (8–0) are meaningful. Games end on average in round 3.6–5.0 of 5.

Possible follow-ups, deliberately not done here (they change rules or AI): give Necron/Aeldari AI a sturdier opening (cover and objective play), add the missing reactive abilities (Fade Back would help the Aeldari most), and match the lists by points.

## Adeptus Mechanicus balance

Measured on 2026-11-09: the tactical (**“Standard”**) AI plays both sides, “Combat Patrol”, **seeds 1–4, both seatings** of every pairing = **40 battles** (8 per pairing). Reproduce with
`BALANCE_SIM=1 BALANCE_FACTION=adeptus_mechanicus npx vitest run src/game/__tests__/balance.test.ts --disableConsoleIntercept` (about 11 minutes). Observation only: **nothing was tuned**. The old pairings cannot change (every new effect is gated on Mechanicus abilities, the golden-master test confirms it), so the table in *Balance observations* above still stands.

| Pairing (A vs B) | Wins A : B : draws | Avg end round | Avg VP (A : B) | Avg models lost (A / B) |
|---|---|---|---|---|
| Space Marines vs Adeptus Mechanicus | 0 : 8 : 0 | 4.8 | 4.4 : 33.8 | 16.1 / 12.9 |
| Orks vs Adeptus Mechanicus | 0 : 8 : 0 | 4.3 | 6.3 : 25.0 | 30.8 / 6.5 |
| Tyranids vs Adeptus Mechanicus | 0 : 8 : 0 | 3.1 | 5.0 : 15.6 | 23.9 / 5.4 |
| Necrons vs Adeptus Mechanicus | 0 : 8 : 0 | 4.8 | 3.8 : 38.1 | 16.9 / 3.9 |
| Aeldari vs Adeptus Mechanicus | 0 : 8 : 0 | 3.8 | 6.9 : 23.8 | 19.9 / 5.6 |

| Army (in these 40 battles) | Wins | Win rate | Wounds dealt / battle | Wounds taken / battle | Damage ratio | Units alive at the end | Avg VP |
|---|---|---|---|---|---|---|---|
| Adeptus Mechanicus | 40 / 40 | **100 %** | 37.2 | 10.4 | **3.58** | 7.8 of 8 | 27.3 |
| Space Marines | 0 / 8 | 0 % | 21.6 | 39.5 | 0.55 | 0.9 of 5 | 4.4 |
| Orks | 0 / 8 | 0 % | 8.0 | 43.6 | 0.18 | 0.3 of 4 | 6.3 |
| Tyranids | 0 / 8 | 0 % | 9.8 | 38.6 | 0.25 | 0.1 of 4 | 5.0 |
| Necrons | 0 / 8 | 0 % | 6.9 | 36.8 | 0.19 | 0.1 of 4 | 3.8 |
| Aeldari | 0 / 8 | 0 % | 5.8 | 27.5 | 0.21 | 0.1 of 4 | 6.9 |

(VP are 5 per controlled objective from round 2, so average VP is an objective-control measure: 27.3 ≈ 5.5 objective-turns per battle for the Mechanicus against 0.8–1.4 for the others.) The side that took the first turn won 50 % and the west seat won 50 %: no seat bias.

**Faction ability use** (counted in the 40 battles; only the Mechanicus abilities are relevant, the opponents' own rows such as Waaagh!, Shadow in the Warp, Reanimation and Guide are in the test output):

| Ability | Uses | Per battle |
|---|---|---|
| Doctrina Imperative chosen: Protector / Conqueror | 147 / 18 | 3.7 / 0.45 |
| Objective Scouted (objective kept) | 57 | 1.4 |
| Feel No Pain (attacks against the led unit) | 29 | 0.7 |
| Voices in the Code (tests forced) | 17 | 0.4 |
| Repulsor Grid (shooters hurt) | 2 | 0.05 |
| Defend the Divine Work | 1 | 0.03 |
| Data-spike | 0 | 0 |

### Major balance problems (documented, not fixed)

1. **The Mechanicus win every battle (40 of 40), with 3.6 times the damage ratio and almost no losses** (7.8 of 8 units alive). They beat the Space Marines, until now the strongest army (97 %), 8–0 and with a clear damage lead. For this AI, these lists and this scoring they are the strongest army by a wide margin. This is **not** a statement about the real game.
2. **Likely causes, not isolated by experiments:**
   - The training roster is the largest of the six: **36 models** (Marines 17, Necrons 17, Aeldari 20, Tyranids 24) and, by the points printed on the datasheet pages, about 865 points by the Field Manual (Kastelans pro-rated, see Points above). The lists are not points-matched, as before.
   - **Long guns and stacking bonuses.** 30–36″ BS 4+ weapons, and the Protector Imperative (chosen in 82 % of turns) adds *Heavy* (+1 to hit when stationary) **and** BS +1 on top, so most shots hit on 2+.
   - **Durable bodies.** T7 / T9 platforms with 3+ / 2+ saves and 5–6+ invulnerable saves, Feel No Pain 5+ for the led unit and Skitarii invulnerable saves of 5+ make the AI armies' small-calibre fire inefficient.
   - **Objective play.** Objective Scouted keeps objectives after the unit leaves, Rad-saturation lowers the OC of enemies near objectives and Neurostatic Interference makes their battle-shock tests fail more often. The Mechanicus earn four to seven times the VP of their opponents.
3. **AI notes.** The AI almost always picks Protector (Conqueror is chosen when the enemy is already close); Defend the Divine Work was used once in 40 battles (its threshold is deliberately high) and **Data-spike never fired** (the Dominus has to be engaged with an enemy VEHICLE; only the Marines' Redemptor and the Orks' Deff Dread qualify, and the Dominus stays back). Repulsor Grid fired rarely because the Kastelans are shot at little.
4. **Levers if a closer match is wanted** (deliberately not applied, they change rules, rosters or AI): a smaller training roster (fewer Skitarii models; the minimum legal sizes are Kataphron 3, Sicarians 5, Kastelan 2, Rangers and Vanguard fixed at 10), a points-matched list, treating *Heavy* and the Protector BS bonus as non-stacking, or a weaker opponent AI preference for the Imperative. A fairer lesson mode would still need the handbook's scenarios.

### AI speed

The Mechanicus army has the most models, so AI decisions are the slowest of all armies. Measured in Node on the development machine, “Standard”, 40 consecutive decisions on “Combat Patrol”: slowest single decision ≈ 0.6 s with the Mechanicus as the AI against Marines (0.5 s for Marines vs Orks, Necrons vs Aeldari) and ≈ 1.3 s for the Orks AI choosing moves against the 36-model army (before the visibility pre-filter it was up to 2.8 s). The old maximum on this board was 0.8 s.
