# Adeptus Mechanicus (“Adeptus Mechanicus”, `adeptus_mechanicus`)

The sixth army of the trainer. It plays on the 44″×30″ “Combat Patrol” board against any other army (15 pairings, either seating). Like the Tyranids, Necrons and Aeldari it has no army for the two small Introductory Set boards.

## Edition and sources

Everything targets **11th edition**, like the rest of the project (see [research.md](research.md)). Each datasheet was read from Wahapedia's 11th-edition transcription on **2026-11-09**: the same community source the project already uses. It is **not the official PDF**, so treat the numbers as unverified against Games Workshop's own files. Nothing from earlier editions was carried over (Canticles of the Omnissiah, Kastelan Protocols, Servitor repair and similar rules were **not** used): the eight 11th-edition pages read for this army list only the Doctrina Imperatives as the faction rule.

- [Tech-Priest Dominus](https://wahapedia.ru/wh40k11ed/factions/adeptus-mechanicus/Tech-priest-Dominus) · [Tech-Priest Manipulus](https://wahapedia.ru/wh40k11ed/factions/adeptus-mechanicus/Tech-priest-Manipulus)
- [Skitarii Rangers](https://wahapedia.ru/wh40k11ed/factions/adeptus-mechanicus/Skitarii-Rangers) · [Skitarii Vanguard](https://wahapedia.ru/wh40k11ed/factions/adeptus-mechanicus/Skitarii-Vanguard)
- [Kataphron Breachers](https://wahapedia.ru/wh40k11ed/factions/adeptus-mechanicus/Kataphron-Breachers) · [Kataphron Destroyers](https://wahapedia.ru/wh40k11ed/factions/adeptus-mechanicus/Kataphron-Destroyers)
- [Sicarian Infiltrators](https://wahapedia.ru/wh40k11ed/factions/adeptus-mechanicus/Sicarian-Infiltrators) · [Kastelan Robots](https://wahapedia.ru/wh40k11ed/factions/adeptus-mechanicus/Kastelan-Robots)
- Core rules (Feel No Pain, Stealth, Infiltrators, Scouts, battle-shock): [core rules transcription](https://wahapedia.ru/wh40k11ed/the-rules/core-rules/)

`src/game/__tests__/mechanicus.test.ts` pins every characteristic and weapon profile below, so a typo in the data fails a test.

**Repair.** The eight datasheets above contain **no repair or healing ability** in 11th edition (the Dominus and Manipulus pages list only Lord of the Machine Cult, Data-spike, Galvanic Field and Defend the Divine Work). No repair mechanic was invented. The healing code the Necrons use (`rules/heal.ts`) is not wired to this army.

## Training roster and legality

The requested roster is legal as listed. Points were not used (the project has no points system). The army has **36 models**, more than the Tyranids (24) or the Marines (17), because three units are fixed or minimum-sized at 10 (Rangers, Vanguard) or 5 (Sicarians).

| Unit | Datasheet size limits | Built | Loadout (legal per the datasheet) |
|---|---|---|---|
| Tech-Priest Dominus | 1 | 1 | macrostubber, volkite blaster, Omnissian axe (default) |
| Tech-Priest Manipulus | 1 | 1 | magnarail lance, Omnissian staff (default) |
| Skitarii Rangers | 10 (1 Alpha + 9) | 10 | Alpha with Alpha combat weapon; 1 arc rifle; 1 plasma caliver; 1 omnispex; 6 galvanic rifles |
| Skitarii Vanguard | 10 (1 Alpha + 9) | 10 | Alpha with Mechanicus pistol + Alpha combat weapon; 1 arc rifle; 1 plasma caliver; 7 radium carbines |
| Kataphron Breachers | 3–6 | 3 | 1 heavy arc rifle + arc claw; 1 torsion cannon + arc claw; 1 heavy arc rifle + hydraulic claw |
| Kataphron Destroyers | 3–6 | 3 | 2 heavy grav-cannon + phosphor blaster; 1 plasma culverin + cognis flamer |
| Sicarian Infiltrators | 5–10 (1 Princeps + 4–9) | 5 | Princeps + 2 with stubcarbine + power weapon; 2 with flechette blaster + taser goad |
| Kastelan Robots | 2–4 | 3 | 1 incendine combustor + twin Kastelan fist; 2 heavy phosphor blaster + Kastelan phosphor blaster + Kastelan fist |

Choices that are mine, not the datasheet's:

- **Transuranic arquebus is not taken.** It needs a 60×35 mm oval base (the engine has round bases only), and its *Precision* keyword has no effect while leaders are separate units. The Rangers keep their identity with the arc rifle, the plasma caliver and the omnispex.
- **Enhanced data-tether is not taken** (it pays CP; there are no stratagems).
- **Base sizes** are the datasheet's (25 mm Skitarii, 50 mm Tech-Priests, 60 mm Kataphron and Kastelan, 40 mm Sicarians).
- The Sicarian page gives one characteristics row for the whole unit, so the Princeps has the troopers' profile and stubcarbine + power weapon.
- A unit with several melee weapons per model uses its first one listed (Alpha combat weapon before the close combat weapon), as everywhere in the engine.
- Leaders (the two Tech-Priests) are **separate units** at the start; see *Leader approximation* below.

## Datasheets as implemented

M / T / Sv / W / Ld / OC (invulnerable save) · base. Weapon profiles are in `src/game/data/mechanicus.ts`.

| Model | M | T | Sv | W | Ld | OC | Inv | Base |
|---|---|---|---|---|---|---|---|---|
| Tech-Priest Dominus / Manipulus | 6″ | 4 | 2+ | 4 | 7+ | 1 | 5+ | 50 mm |
| Skitarii Ranger / Vanguard (and Alphas) | 6″ | 3 | 4+ | 1 | 7+ | 2 | 5+ | 25 mm |
| Kataphron Breacher | 5″ | 7 | 3+ | 3 | 7+ | 1 | 6+ | 60 mm |
| Kataphron Destroyer | 5″ | 6 | 3+ | 3 | 7+ | 1 | 6+ | 60 mm |
| Sicarian Infiltrator / Princeps | 8″ | 4 | 4+ | 2 | 7+ | 1 | 5+ | 40 mm |
| Kastelan Robot | 6″ | 9 | 2+ | 7 | 7+ | 2 | 5+ | 60 mm |

Roles (what makes the units different):

| Unit | Role |
|---|---|
| Rangers | Long-range line infantry (30″ galvanic / arc rifles), the omnispex removes cover from the whole unit; Objective Scouted keeps objectives after they leave. |
| Vanguard | Short-range firepower: radium carbines (18″, Anti-Infantry 4+) plus an arc rifle and plasma caliver; Rad-saturation lowers the OC of enemies within 3″. |
| Kataphron Breachers | Durable heavy fire support (T7, 3+, 6+ invulnerable); heavy arc rifles hurt vehicles, torsion cannon is Anti-Infantry 2+ Blast, hydraulic claw hits S8 D3; Breaching Command re-rolls hits. |
| Kataphron Destroyers | Specialised ranged destruction: heavy grav-cannons (A4, Anti-Vehicle 2+), plasma culverin (36″, supercharge), phosphor blasters and cognis flamers ignore cover. |
| Sicarian Infiltrators | Mobility and disruption: M8, Stealth, Infiltrators, taser goads (Sustained Hits 2), Voices in the Code and Neurostatic Interference attack the enemy's morale. |
| Kastelan Robots | Heavy mechanical platforms: T9, 2+, W7; phosphor weapons ignore cover; Kastelan fists (S12 D3); Repulsor Grid punishes shooters. |
| Tech-Priest Dominus | Support in the front line: Feel No Pain 5+ for the unit he leads, Data-spike against vehicles, Omnissian axe in melee. |
| Tech-Priest Manipulus | Fire support: magnarail lance (36″, Heavy), Lethal Hits for the unit he leads, once-per-battle 4+ invulnerable save. |

## Added units (12.11.2026)

Four more datasheets for the army builder, transcribed from Wahapedia on 12.11.2026. The presets and the training roster do not change, so the AI fingerprints stay the same.

| Unit | Points | What it is | Rules in the game |
|---|---|---|---|
| Serberys Sulphurhounds | 3 — 55, 6 — 95 | fast cavalry, M12″: sulphur breath (Torrent, 9″), phosphor pistols; one model in three may take a phosphor blast carbine | **Line-breakers**: when the charge move ends, a D6 per model engaged with the charged unit; 4+ is a mortal wound, +2 to each roll if the charge started within 6″ of friendly Mechanicus BATTLELINE |
| Ironstrider Ballistarii | 1 — 80, 2 — 160, 3 — 250 (from the 3rd unit: 95 / 175 / 265) | walker, M10″, T7: twin cognis autocannon or lascannon, 48″ | **Elevated Strider**: shoots with every weapon after an Advance and after Falling Back. **Data-tether**: a Stratagem on it gives back 1 CP on a 5+. Deadly Demise 1 |
| Onager Dunecrawler | 150 | heavy walker, T10, 2+ / 4+ invulnerable, OC3: eradication beamer (3D3, Blast), daedalus + Icarus, neutron laser + heavy stubber, or twin heavy phosphor blaster | **Emanatus Force Field**: friendly Mechanicus BATTLELINE within 6″ has a 4+ invulnerable save against shooting. **Damaged 1–4 wounds**: −1 to hit. Deadly Demise D3 |
| Corpuscarii Electro-Priests | 5 — 60, 10 — 120 | zealots: electrostatic gauntlets, 12″ Pistol and melee, Sustained Hits 2 | **Feel No Pain 5+**. **Electro-shock**: the enemy unit it shot and hit (not MONSTER/VEHICLE) gets −2″ Move and −2 to Advance and Charge rolls until the end of its owner's next turn (the same state as Disruption Bombardment) |

**New engine support:**

- random attacks `3D3` (eradication beamer);
- Feel No Pain from the datasheet (`feelNoPain5`);
- the damaged state (`damaged1to4`).

**Not modelled:**

- Scuttling Walker (moving through terrain up to 4″ high; terrain has no height here);
- the Onager's optional extra heavy stubber and data-tether;
- the lascannon's +10 points.

Oval bases are drawn as round ones: Sulphurhounds 50 mm, Ironstriders 90 mm. Each model has its own blueprint portrait (`src/assets/tokenArt.ts`).

## Faction mechanics

Each is a reusable rule keyed on a datasheet ability, not a faction special case in the engine (the only faction-named logic is the army rule's own state, `PlayerState.imperative`). Everything is tested in `mechanicus.test.ts`; the Marines/Orks golden-master test still passes unchanged.

| Mechanic | Used by | Implementation |
|---|---|---|
| **Doctrina Imperatives** (army rule): Protector = ranged weapons Heavy, BS +1, melee attacks against a BATTLELINE unit (or one within 6″ of friendly BATTLELINE) are −1 to hit. Conqueror = ranged weapons Assault, melee WS +1, AP +1 for BATTLELINE or units within 6″ of friendly BATTLELINE | every unit | command `imperative`, `PlayerState.imperative`, `attackerBonuses` / `meleeSetup` / `shootPlan` in `engine.ts`, `imperativeOf` / `battlelineSupport` in `gameState.ts` |
| **Feel No Pain X+**: each point of damage is ignored on X+ (dice shown in the dice log) | Lord of the Machine Cult (5+) | `AttackContext.fnp`, `resolveGroup` |
| **Ignores Cover** (weapon keyword or the Omnispex wargear) | phosphor weapons, flamers, Rangers with an omnispex | `WeaponKeywords.ignoresCover`, `ModelProfile.wargear`, `shootPlan` |
| **Stealth**: always the benefit of cover against ranged attacks | Sicarians | `shootPlan` |
| **Precision** keyword | (data only, see above) | `WeaponKeywords.precision`, `pickModelForDamage(u, precision)` |
| **Objective Scouted**: at the end of your Command phase keep objectives your unit is near until the enemy's level is higher than yours | Rangers | `Objective.held`, `holdScoutedObjectives`, `updateObjectiveControl` |
| **Rad-saturation**: enemy non-VEHICLE units within 3″ have OC −1 | Vanguard | `objectiveLevels` |
| **Breaching Command**: re-roll hit rolls of 1; any failed hit near friendly BATTLELINE | Breachers | `attackerBonuses` |
| **Voices in the Code**: at the start of the Fight phase every engaged enemy unit tests battle-shock | Sicarians | `fightStartMechanicus` |
| **Neurostatic Interference** (aura 6″): battle-shock and Leadership tests of enemy units −1 (−2 near friendly BATTLELINE) | Sicarians | `neurostaticMod`, `leadershipRoll` |
| **Repulsor Grid**: each unmodified 6 on the Kastelans' save rolls against ranged attacks gives the shooter 1 mortal wound after it has shot (before Deadly Demise and the winner check) | Kastelans | `ResolveResult.repulsed`, `apply('shoot')` |
| **Data-spike**: at the start of the Fight phase, a Dominus engaged with an enemy VEHICLE rolls D6: 4+ = D6 mortal wounds and the vehicle's melee WS is 1 worse until the end of the phase | Dominus | `fightStartMechanicus`, `UnitState.spiked` |
| **Defend the Divine Work** (once per battle): 4+ invulnerable save | Manipulus | command `divineWork`, `PlayerState.divineUsed`, `UnitState.warded`, `invulnOverrideOf` |
| **Infiltrators** in deployment: anywhere more than 8″ from the enemy zone and enemy models | Sicarians | `deploymentProblem` |
| **Deadly Demise 1** | Kastelans | existing |

### Approximations (all labelled “[Approximation: …]” in the unit card)

1. **Doctrina Imperatives timing.** The rule chooses an Imperative at the **start of each battle round** for the whole round. The engine only lets the active player decide, so the Imperative is chosen **in your own Command phase** and lasts **until your next Command phase**. For the player who goes first this is exactly one battle round; the second player gets it from their own turn through the enemy's next turn. If it is not chosen, no Imperative applies. The AI always chooses; a human has two buttons in the Command phase (the action panel and the board toolbar).
2. **Leader approximation.** Attached units are not implemented. A Tech-Priest *leads* the **nearest friendly Skitarii or Kataphron unit within 3″** (edge to edge; ties broken by unit id), exactly one unit, recomputed every time. Only the "while leading" abilities use it: Feel No Pain 5+ (Dominus), Lethal Hits (Manipulus), the unit protected by Defend the Divine Work. Data-spike uses the Dominus's own engagement, not the led unit's.
3. **Defend the Divine Work** is used in your own turn (the rule allows the start of *any* phase, but an out-of-turn command would break the "who owns the decision" rule, the same reason Shadow in the Warp is Command-phase only). The 4+ invulnerable save lasts until the start of your next turn (through the enemy's turn): longer than one phase, once per battle.
4. **Feel No Pain** applies to normal and Devastating-Wounds damage, **not** to mortal wounds from Hazardous, Deadly Demise, Repulsor Grid or Data-spike.
5. **Data-spike** and **Voices in the Code** are optional in the rules; the simulator uses them automatically at the start of every Fight phase (both players' turns). A unit that passes the Voices test keeps its current battle-shock status.
6. **Repulsor Grid** is read literally: *each* unmodified 6 on *any* save roll against a ranged attack is one mortal wound for the shooter.
7. **Arc rifle, torsion cannon and other random profiles** follow the project's random-characteristics approximation (D3 attacks rolled per model).

### Not implemented (never replaced by an unrelated effect)

| Ability | Why |
|---|---|
| Sentinel Directives (Kataphron Destroyers) | Needs the Fire Overwatch stratagem. |
| Scouts 6″ (Rangers) | There is no pre-battle move step; the default positions are used. |
| Robotic Bodyguard (Kastelans) | Needs a Cybernetica Datasmith, who is not in the roster. |
| Enhanced data-tether | Needs stratagems / CP spending. |
| Attached units / Leader | See approximation 2. |
| Transuranic arquebus, Precision on real targets | See "Choices". |
| Vertical movement, Hidden, reserves, stratagems | Not modelled anywhere in the engine. |

Each is marked “[Not implemented …]” in the unit card.

## AI behaviour

The same utility AI (`ai/ai.ts`) with faction weights, both levels (**“Beginner”** and **“Standard”**). Every command goes through `validate()` / `apply()`; every explanation is in the interface language.

- **Weights** `adeptus_mechanicus`: damageDealt 1.0, damageTaken 0.85, objective 1.1, distance 0.1, attackOpportunity 0.5, survival 1.0, positioning 0.6, **support 0.8**. Style: not aggressive, falls back from a lost melee. Efficient ranged engagements: it values expected shooting damage, cover and objectives, and avoids a charge unless the exchange favours it.
- **Doctrina Imperative.** “Standard” compares the expected shooting + melee result of both Imperatives over the whole army (an army with no target within 24″ is assumed to move, so Heavy does not count) and says why. “Beginner” takes Conqueror when an enemy is within 12″ and Protector otherwise.
- **Tech-Priests** get a goal toward the unit they could lead and a **support** bonus for staying within 3″ of it; their value (character, ×1.5) keeps them out of danger.
- **Valuable platforms.** Kataphron Breachers, Destroyers and Kastelans have a ×1.3 loss weight (the AI protects them).
- **Sicarians hunt** (they behave like the Skorpekh Destroyers: they move toward the enemy rather than the nearest objective).
- **Defend the Divine Work** is used once, at the end of the Movement phase, when the Manipulus's group is engaged or the expected incoming damage is at least 60 % of its remaining wounds (“Standard”), or when engaged (“Beginner”).
- Feel No Pain is included in the AI's expected damage, so enemies understand that the led unit is tougher.

## Balance

See [armies.md](armies.md#adeptus-mechanicus-balance) for the numbers. Measured on 2026-11-09 (40 battles against the five other armies), observation only: nothing was tuned. **Headline: the Mechanicus won 40 of 40 battles with a 3.6 damage ratio, so for this AI and these lists they are the strongest army by a wide margin; causes and levers are documented there.** Not forced to 50 %, as requested.

## UI and artwork

- The faction is selectable on the start screen (six cards) and as an opponent; the card shows the original **faction emblem** (a brass cog around a mechanical skull, `mechanicusEmblem()` in `tokenArt.ts`), four unit portraits and the real composition (“Total models: 36”).
- **Original SVG portraits** for all 21 model profiles in `src/assets/tokenArt.ts` (blueprint style, brass lines on deep-red robes): cog-haloed Tech-Priests with servo-arms (axe / magnarail lance), hooded Skitarii with mechanical skull faces (long rifles for Rangers, short carbines and a radiation ring for Vanguard, an Alpha crest), hulking tracked Kataphron (arc rifle and claw / torsion cannon / hydraulic claw / grav-cannons / culverin and flamer), lean Sicarians (blade or taser goad), boxy Kastelans with cog chest plates. Resolution order is unchanged: photo → manifest → SVG. No Games Workshop images or traced artwork; see [assets.md](assets.md).
- Each datasheet has a short **role description** shown on the unit card (optional `Datasheet.description`, rendered for every faction that has one), the weapon table with keywords, and the ability texts, including the approximation and “not implemented” notes.
- A human Mechanicus player picks the Imperative with two buttons in the Command phase (action panel “Doctrina Imperatives” and the board toolbar “🛡 Protector” / “⚔ Conqueror”) and uses Defend the Divine Work from the Manipulus's action list or the toolbar. The header shows the active Imperative; the guidance line and the Command-phase help mention it.

## Compatibility

- Marines and Orks (and the Tyranids, Necrons and Aeldari) are unchanged: every new effect is keyed on a Mechanicus-only ability or state, and new state fields exist only in Mechanicus battles (`PlayerState.imperative` / `divineUsed`, `UnitState.warded` / `spiked`, `Objective.held`). The golden-master test and all earlier tests pass.
- Saves: `SCHEMA_VERSION` and the save format are unchanged. Old saves load as before; a Mechanicus save round-trips with its new fields. Multiplayer is not changed (the new commands are ordinary commands; no new networking).
- The visibility check got a bounding-box pre-filter (identical results, about 35 % faster AI in battles against large armies).

## Tests

`mechanicus.test.ts` (107 tests): every characteristic and weapon profile, keywords, composition and loadout limits, deployment in either seat against every opponent, each mechanic above with scripted dice (Imperatives incl. timing, FNP rolls, leader approximation, Divine Work lifetime, Objective Scouted, Rad-saturation, Breaching Command, cover / Ignores Cover / Omnispex / Stealth, Voices, Neurostatic, Repulsor Grid incl. a shooter dying, Data-spike), movement limits, shooting and fighting, Infiltrators in deployment, persistence, and the AI (Imperative choice, Tech-Priest positioning, Divine Work, whole battles against Marines and Orks with legal commands only). `armyBattles.test.ts`: complete AI-vs-AI battles for all 15 pairings through the real match pipeline. `ui/armies.test.tsx`: the selection screen, a human playing Mechanicus through the store, the Imperative and Divine Work buttons, the unit card text.
