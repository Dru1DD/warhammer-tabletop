# Aeldari: units beyond the first four

The Aeldari had a Farseer, Guardian Defenders, Dire Avengers and Windriders. Four more units are now available in the army builder: Autarch, Rangers, Wraithguard and Swooping Hawks. The training rosters are unchanged.

## Edition and sources

Everything targets **11th edition**. Each datasheet was read from Wahapedia's 11th-edition transcription (Aeldari Faction Pack v1.4) on **2026-11-10**. It is a community source, **not the official PDF**. None of the four is a Legends datasheet.

- [Autarch](https://wahapedia.ru/wh40k11ed/factions/aeldari/Autarch) · [Rangers](https://wahapedia.ru/wh40k11ed/factions/aeldari/Rangers)
- [Wraithguard](https://wahapedia.ru/wh40k11ed/factions/aeldari/Wraithguard) · [Swooping Hawks](https://wahapedia.ru/wh40k11ed/factions/aeldari/Swooping-Hawks)

**Points** come from the Munitorum Field Manual values on Dakkapedia (2026-06-17):

| Unit | Points |
|---|---|
| Autarch | 85 |
| Rangers | 5 models: 60, 10 models: 110 |
| Wraithguard | 5 models: 145 |
| Swooping Hawks | 5 models: 100, 10 models: 190 (3rd+ unit: 115 / 205) |

Wahapedia's own Autarch price is 70. The project keeps one points source.

**Ids:** the Rangers' ids are `aeldariRangers` / `aeldariRanger`, because `rangers` / `ranger` are the Skitarii Rangers. A test (`aeldariExtra.test.ts`) now fails if two data files ever use the same id: before, the later file silently replaced the earlier entry.

`src/game/__tests__/aeldariExtra.test.ts` pins every characteristic and weapon profile below.

## Datasheets as implemented

M / T / Sv / W / Ld / OC (invulnerable save) · base. Default loadouts only.

| Model | Profile | Weapons |
|---|---|---|
| Autarch | 7″ / 3 / 3+ / 4 / 6+ / 1 (4+) · 32 mm | Shuriken Pistol (BS 2+); Star Glaive A4 WS 2+ S6 AP −3 D3 |
| Ranger | 7″ / 3 / 5+ / 1 / 7+ / 1 · 28.5 mm, 5+ invulnerable save against ranged attacks | Long Rifle 36″ A1 BS 3+ S4 AP −1 D2 (Heavy, Precision); Shuriken Pistol (the page shows BS 2+); close combat weapon |
| Wraithguard | 6″ / 6 / 2+ / 3 / 8+ / 1 · 40 mm | Wraithcannon 18″ A1 BS 4+ S14 AP −4 D D6+1; close combat weapon A3 |
| Swooping Hawk (Exarch) | 14″ / 3 / 4+ / 1 / 6+ / 1 (Exarch 5+) · 32 mm, FLY | Lasblaster 24″ A4 BS 3+ S4 (Assault, Lethal Hits); the Exarch has a Hawk's Talon 24″ A2 S6 AP −2 D2 (Lethal Hits) |

Unit sizes: Autarch 1; Rangers 5 or 10; Wraithguard 5; Swooping Hawks 5 or 10.

## Rules

| Rule | Unit | Status |
|---|---|---|
| Battle Focus | all | As for the other Aeldari. |
| Superlative Strategist | Autarch | While the Autarch leads a unit, the unit can re-roll its Advance roll (button “Re-roll”, the same command as Waaagh!). An Autarch on its own cannot ([leaders.md](leaders.md)). **Not implemented:** the re-rolls for Agile Manoeuvres. |
| Path of Command | Autarch | **Not implemented**: there are no stratagems. |
| 5+ invulnerable save vs ranged | Rangers | Applied to shooting only. Melee attacks do not get it. |
| Infiltrators, Stealth | Rangers | Core rules, already used by the Sicarians. |
| Path of the Outcast | Rangers | **Not implemented**: no reactions in the opponent's turn. |
| War Construct | Wraithguard | The unit can shoot after Falling Back. It still cannot charge. |
| Psychic Guidance | Wraithguard | While a friendly AELDARI PSYKER (the Farseer) is within 12″: Ld 6+ and +1 to hit. |
| Grenade Pack Flyover | Swooping Hawks | Once per turn, in the Movement phase after any move, pick a visible enemy unit within 8″ and roll a D6 per model: each 4+ is a mortal wound, at most 6. It is offered in the unit card, and the AI uses it. |
| Deep Strike, Aspect Shrine tokens | Swooping Hawks | **Not implemented**: there are no reserves and no tokens. |

## Presets

The Aeldari presets in the army builder now use the new units:

- **500 (480 points):** Farseer, Autarch, Guardian Defenders, 5 Rangers, 5 Swooping Hawks, 5 Dire Avengers.
- **1000 (980 points):** Farseer, Autarch, 2 × Guardian Defenders, 10 Rangers, 5 Rangers, 5 Wraithguard, 5 Swooping Hawks, 10 Dire Avengers, 3 Windriders.
- **1500, 2000, 2500:** see [armies.md](armies.md#presets-over-1000-points).
