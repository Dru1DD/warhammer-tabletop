# Vehicles and monsters

Ten datasheets for the five armies that had almost no vehicles: a transport and a battle tank for Space Marines, Orks, Necrons and Aeldari, and two gun beasts for Tyranids. They were transcribed from Wahapedia (11th edition) on 13.11.2026. They are in the army builder; the presets and the training rosters do not change, so the AI fingerprints stay the same.

Code: `src/game/data/vehicles.ts` (weapons, profiles, datasheets, ability texts, optional wargear slots). Tests: `src/game/__tests__/newVehicles.test.ts`.

## The units

| Army | Unit | Points | What it is | Rules in the game |
|---|---|---|---|---|
| Space Marines | Rhino | 70 (4th+: 80) | Dedicated Transport, M12″, T9, W10: storm bolter | Carries 12 INFANTRY (no Gravis, Jump Pack or Terminator). **Firing Deck 2**. Deadly Demise D3 |
| Space Marines | Predator Annihilator | 135 (3rd+: 145) | tank, T10, W11: twin lascannon and two lascannons (or two heavy bolters) | Damaged 1–4 wounds. Deadly Demise D3 |
| Orks | Trukk | 60 (4th+: 70) | Dedicated Transport, M12″, T8, 6+ invulnerable: dual big shoota or rokkit launcha | Carries 12 INFANTRY. **Firing Deck 12**: everyone inside shoots. Deadly Demise D3 |
| Orks | Battlewagon | 160 (3rd+: 180) | transport, T11, W16, OC5: crushin’ bulk, up to 4 big shootas | Carries 22 INFANTRY. **Firing Deck 11**. **Mobile Fortress**: ranged attacks against it have −1 Damage. Damaged 1–6 wounds. Deadly Demise D6 |
| Necrons | Ghost Ark | 100 | Dedicated Transport, FLY, T9, 4+ invulnerable: two gauss flayer arrays | Carries Necron Warriors and a Necrons INFANTRY CHARACTER. Deadly Demise D3 |
| Necrons | Doomsday Ark | 200 (3rd+: 230) | FLY, 4+ invulnerable: doomsday cannon (D6+1 shots, 72″, S18, AP−4, D4, Blast, Heavy) | **Overwhelming Obliteration**: if it Remained Stationary in its Movement phase, the cannon has Devastating Wounds until the end of the turn. Damaged 1–5. Deadly Demise D3 |
| Aeldari | Wave Serpent | 115 (4th+: 125) | Dedicated Transport, FLY, M14″, 5+ invulnerable: twin shuriken cannon or another turret | Carries 12 Asuryani INFANTRY (no Jump Pack; a Wraithguard takes 2 places). **Wave Serpent Shield**: −1 to wound against ranged attacks whose Strength is greater than its Toughness. Damaged 1–4. Deadly Demise D3 |
| Aeldari | Fire Prism | 150 | FLY, M14″: prism cannon, 60″ (2D6 Blast shots, or two S18 D6 lances) | Damaged 1–4. Deadly Demise D3 |
| Tyranids | Exocrine | 135 (3rd+: 145) | MONSTER, T10, W14: bio-plasmic cannon (D6+3 shots, S9, AP−3, D3, Blast, Heavy) | Damaged 1–5. Deadly Demise D3 |
| Tyranids | Tyrannofex | 170 (3rd+: 180) | MONSTER, T12, 2+, W16: fleshborer hive (20 shots), acid spray or rupture cannon | Damaged 1–5. Deadly Demise D6 |

**New engine support:**

- random attacks `2D6` (the Fire Prism's dispersed pulse);
- the damaged state at 1–5 and 1–6 wounds (`damaged1to5`, `damaged1to6`), and Deadly Demise D6;
- transports: `anyOf` (the Ghost Ark carries Necron Warriors or an INFANTRY CHARACTER) and `double` (models that take 2 places);
- Wave Serpent Shield and Mobile Fortress (`defenceMods` in `engine.ts`), Overwhelming Obliteration (`obliteration`).

## Optional wargear of single-model vehicles

Some vehicles may add or swap weapons: a hunter-killer missile, a storm bolter, up to four big shootas, another turret. These choices are **slots** (`VEHICLE_SLOTS` in `data/vehicles.ts`). Each slot is a drop-down list in the «⚙» editor, and the editor shows all weapons of the result.

| Unit | Slots |
|---|---|
| Rhino | hunter-killer missile |
| Predator Annihilator | sponsons (2 lascannons or 2 heavy bolters), hunter-killer missile, storm bolter |
| Trukk | gun (dual big shoota or rokkit launcha), close combat (buzzsaw or grabbin’ klaw) |
| Battlewagon | 0–4 big shootas, wreckin’ ball, grabbin’ klaw |
| Wave Serpent | turret (twin shuriken cannon, missile launcher, bright lance, scatter laser or starcannon), hull weapon (twin shuriken catapult or shuriken cannon) |
| Fire Prism | hull weapon |
| Tyrannofex | fleshborer hive, acid spray or rupture cannon |
| Onager Dunecrawler | additional cognis heavy stubber; broad spectrum data-tether (a Stratagem on it gives back 1 CP on a 5+; it loses the SMOKE keyword, so Smokescreen cannot target it) |

**How it works.** The registry (`data/datasheets.ts`) builds a model profile for every combination of choices on every base profile, for example `battlewagonShoota3Ball`. The id is the base id plus the ids of the chosen choices. Two identical weapons on one model become one weapon with twice the attacks (`times()`): the Onager's neutron laser comes with a heavy stubber, so with the additional one it has `cognisHeavyStubberX2`. The loadout keeps the choices in `Loadout.slots`; `composeLoadout` adds the suffix, `loadoutOf` reads it back. Tokens and portraits are those of the base profile. As with the other wargear, the engine and the AI need no change.

## Simplifications

- **Bases.** Tanks and skimmers have no base or a small flying stand under a large hull. The game measures from round bases, so they get a circle about the size of the hull: Rhino, Trukk, Wave Serpent and Fire Prism 100 mm, Predator, Ghost Ark and Doomsday Ark 110 mm, Battlewagon 130 mm. The oval monster bases (120 × 92 mm) are 105 mm circles.
- **Transports.** The Ghost Ark carries 10 Necron Warriors and 1 CHARACTER on the datasheet; here it has 11 places for either. Orks have no Mega Armour or Ghazghkull models yet, so their extra places are not needed.
- **Points.** Wargear does not change the price (as for the other units): the Tyrannofex's acid spray (+10) and rupture cannon (+20) are not counted.
- **Not implemented** (the ability text says so): Veiling Smoke (Rhino), Annihilator (re-rolling damage), Pilin’ Out (Trukk), Repair Barge (Ghost Ark), Linked Fire and Crystal Matrix (Fire Prism), Symbiotic Targeting (Exocrine), Resilient Organism (Tyrannofex).

## A fix in the old data

The Onager's eradication beamer (dissipated) was S10; the datasheet says S9.
