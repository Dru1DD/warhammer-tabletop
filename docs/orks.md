# Orks: units beyond the Introductory Set

Until this addition the Orks had only Boyz and the Deff Dread, the fewest datasheets of any army. Four more units are now available in the army builder: Warboss, Nobz, Gretchin and Kommandos. The training rosters are unchanged, so the new units appear only in army lists (presets or the player's own).

## Edition and sources

Everything targets **11th edition**, like the rest of the project. Each datasheet was read from Wahapedia's 11th-edition transcription (Orks app v1.2) on **2026-11-10**. It is a community source, **not the official PDF**.

- [Warboss](https://wahapedia.ru/wh40k11ed/factions/orks/Warboss) · [Nobz](https://wahapedia.ru/wh40k11ed/factions/orks/Nobz)
- [Gretchin](https://wahapedia.ru/wh40k11ed/factions/orks/Gretchin) · [Kommandos](https://wahapedia.ru/wh40k11ed/factions/orks/Kommandos)

**Lootas were not taken:** in 11th edition the page lists them under Warhammer Legends, which is not used in matched play.

**Points** come from the Munitorum Field Manual values on Dakkapedia (2026-06-17), like the rest of the army builder:

| Unit | Points |
|---|---|
| Warboss | 75 |
| Nobz | 5 models: 105, 10 models: 210 (3rd+ unit: 115 / 220) |
| Gretchin | 10 models: 45, 20 models: 80 |
| Kommandos | 10 models: 120 |

Two notes on the sources:
- **Gretchin size.** Dakkapedia lists Gretchin as 11 / 22 models (an older composition that counted the Runtherd). The 11th-edition datasheet is 10–20 Gretchin, so the builder uses 10 and 20 at those prices.
- **Wahapedia's own prices differ**, for example Nobz 115 for 5. The project keeps one points source.

`src/game/__tests__/orks.test.ts` pins every characteristic and weapon profile below.

## Datasheets as implemented

M / T / Sv / W / Ld / OC (invulnerable save) · base. Default loadouts only: wargear options are not in the army builder yet.

| Model | Profile | Weapons |
|---|---|---|
| Warboss | 6″ / 6 / 4+ / 6 / 6+ / 1 (5+) · 50 mm | Kustom Shoota; Kustom Choppa 6 A, WS 2+, S7, AP −2, D2, Cleave 2 |
| Nob (Nobz) | 6″ / 5 / 4+ / 3 / 7+ / 1 · 40 mm | Kustom Shoota; Kustom Krumpa 3 A, WS 3+, S10, AP −2, D2 |
| Gretchin | 6″ / 2 / 6+ / 1 / 8+ / 1 · 25 mm | Grot Blasta 12″, A1, BS 4+, S3 (Close-quarters); Scavenged Shivs |
| Kommando / Kommando Nob | 6″ / 5 / 5+ / 1 (Nob 3) / 7+ / 1 · 32 mm | Slugga; Choppa |

Kustom Shoota: 18″, A4, BS 5+, S4, AP 0, D1, Lethal Hits (not vs MONSTER / VEHICLE), Rapid Fire 2.

Unit sizes: Warboss 1; Nobz 5 or 10; Gretchin 10 or 20; Kommandos 10 (1 Nob + 9).

## Rules

| Rule | Unit | Status |
|---|---|---|
| Waaagh! (army rule) | all | As for the Boyz: re-roll Advance, riled up after the War Cry. |
| Ammo Runts / Boss' Ammo Runt | Warboss, Nobz | Once per battle +1 to hit when shooting. Same mechanism as the Boyz. |
| Might Is Right | Warboss | After a charge, melee attacks get +3 A and +2 S. |
| Thievin' Scavengers | Gretchin | At the end of your Movement phase, an objective your army controls near the Gretchin stays yours until the enemy's level is higher. This is the same mechanism as the Rangers' Objective Scouted, but at the end of Movement instead of Command. |
| Infiltrators, Stealth | Kommandos | Core rules, already used by the Sicarians. In army lists the set-up places Kommandos inside their own zone, which is legal. |
| Bomb Squig | Kommandos | Once per battle, after a normal move: a visible enemy unit within 12″, D6, on 3+ it suffers D3 mortal wounds. It is offered in the unit card, and the AI uses it on the target where the wounds kill the most. |
| Intimidating Motivation | Warboss | **Not implemented.** "Riled up" is army-wide in this engine (the Waaagh!), there is no per-unit state for it. |
| Get Out da Way! | Nobz | **Not implemented.** Charge moves still go around other bases. |
| Found 'Em!, Nowhere to Hide, Taktikal Know-wotz | Kommandos | **Not implemented.** The game has no detection rules, and units cannot be split. |
| Leader (Warboss → Boyz, Nobz) | Warboss | The Warboss joins Boyz or Nobz ([leaders.md](leaders.md)). Might Is Right is for the Warboss's own attacks, as on the datasheet. |

## Presets

The Ork presets in the army builder now use the new units:

- **500 (495 points):** Warboss, 20 Boyz, 5 Nobz, 10 Kommandos, 10 Gretchin.
- **1000 (975 points):** Warboss, 2 × 20 Boyz, 10 Boyz, 5 Nobz, 10 Kommandos, 20 Gretchin, 2 Deff Dreads.
- **1500, 2000, 2500:** see [armies.md](armies.md#presets-over-1000-points).

## AI

- **New Ork units** use the AI's full melee estimate, so Might Is Right counts when the Warboss weighs a charge.
- **Boyz and the Deff Dread** keep their pinned legacy estimate, so their behaviour in the golden-master games does not change.
