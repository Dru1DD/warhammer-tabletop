# Necrons: units beyond the first four

The Necrons had an Overlord, Necron Warriors, Skorpekh Destroyers and Canoptek Scarab Swarms. Four more units are now available in the army builder: Royal Warden, Immortals, Lychguard and Canoptek Wraiths. The training rosters are unchanged.

## Edition and sources

Everything targets **11th edition**. Each datasheet was read from Wahapedia's 11th-edition transcription (App. Necrons v1.2) on **2026-11-10**. It is a community source, **not the official PDF**. None of the four is a Legends datasheet.

- [Royal Warden](https://wahapedia.ru/wh40k11ed/factions/necrons/Royal-Warden) · [Immortals](https://wahapedia.ru/wh40k11ed/factions/necrons/Immortals)
- [Lychguard](https://wahapedia.ru/wh40k11ed/factions/necrons/Lychguard) · [Canoptek Wraiths](https://wahapedia.ru/wh40k11ed/factions/necrons/Canoptek-Wraiths)

**Points** come from the Munitorum Field Manual values on Dakkapedia (2026-06-17):

| Unit | Points |
|---|---|
| Royal Warden | 50 |
| Immortals | 5 models: 70, 10 models: 140 |
| Lychguard | 5 models: 80, 10 models: 160 |
| Canoptek Wraiths | 3 models: 95, 6 models: 220 (2nd+ unit: 115 / 240) |

Wahapedia's own Immortals price is 65 / 130. The project keeps one points source.

`src/game/__tests__/necronsExtra.test.ts` pins every characteristic and weapon profile below.

## Datasheets as implemented

M / T / Sv / W / Ld / OC (invulnerable save) · base. Default loadouts only (no tesla carbines, hyperphase swords and shields, or Wraith guns and whip coils).

| Model | Profile | Weapons |
|---|---|---|
| Royal Warden | 5″ / 5 / 3+ / 4 / 6+ / 1 · 32 mm | Relic Gauss Blaster 24″ A2 BS 3+ S5 AP −1 D2 (Lethal Hits, Rapid Fire 2); close combat weapon A4 |
| Immortal | 5″ / 5 / 3+ / 1 / 7+ / 2 · 32 mm, BATTLELINE | Gauss Blaster 24″ A2 BS 3+ S5 AP −1 D1 (Lethal Hits); close combat weapon A2 |
| Lychguard | 5″ / 5 / 3+ / 2 / 7+ / 1 · 32 mm | Warscythe A2 WS 3+ S8 AP −3 D2 (Devastating Wounds) |
| Canoptek Wraith | 10″ / 6 / 3+ / 4 / 8+ / 2 (4+) · 50 mm, FLY | Vicious Claws A4 WS 4+ S6 AP −1 D2 |

Unit sizes: Royal Warden 1; Immortals and Lychguard 5 or 10; Wraiths 3 or 6.

## Rules

| Rule | Unit | Status |
|---|---|---|
| Reanimation Protocols | all | As for the other Necrons. |
| Adaptive Strategy | Royal Warden | The unit can shoot and charge after Falling Back. Same mechanism as the Tyranid Warriors' Adaptable Predators. |
| Engrammatic Logic | Royal Warden | Once per battle, remove battle-shock from a friendly unit within 12″. **Approximation:** it can be used at any time in your turn, not only at the start of a phase. It is offered in the unit card, and the AI uses it in its Command phase, preferring a unit near an objective. |
| Implacable Eradication | Immortals | Re-roll wound rolls of 1, or every failed wound roll against a target within range of an objective. Added as a general `rerollWounds` attack option, also counted in the AI's damage estimate. |
| Guardian Protocols | Lychguard | While a NOBLE leads the unit, attacks with Strength above its Toughness get −1 to wound. The Overlord must be inside the unit ([leaders.md](leaders.md)). |
| Wraith Form | Canoptek Wraiths | After a Normal move, choose an enemy unit the Wraiths passed over (a model's base swept across one of its bases), roll a D6 per Wraith, and each 4+ is 1 mortal wound. Offered in the unit card, and used by the AI. Passing over enemy models needs a FLY move (“Take off”), as everywhere in the engine. |
| Leader | Overlord, Royal Warden | They join Necron Warriors, Immortals or (the Overlord) Lychguard ([leaders.md](leaders.md)). |

## Presets

The Necron presets in the army builder now use the new units:

- **500 (495 points):** Overlord, Royal Warden, 10 Immortals, 5 Lychguard, 3 Canoptek Wraiths, 3 Scarab Swarms.
- **1000 (990 points):** Overlord, Royal Warden, 20 Necron Warriors, 2 × 10 Immortals, 10 Lychguard, 3 Canoptek Wraiths, 3 Skorpekh Destroyers, 3 Scarab Swarms.
- **1500, 2000, 2500:** see [armies.md](armies.md#presets-over-1000-points).
