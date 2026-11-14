# Space Marines: units beyond the Introductory Set

The Marines had the Introductory Set units (Lieutenant, Intercessors) and the Combat Patrol additions (Assault Intercessors, Redemptor). Four more units are now available in the army builder: Captain, Hellblaster Squad, Infernus Squad and Bladeguard Veteran Squad. The training rosters are unchanged.

## Edition and sources

Everything targets **11th edition**. Each datasheet was read from Wahapedia's 11th-edition transcription on **2026-11-10**. It is a community source, **not the official PDF**.

- [Captain](https://wahapedia.ru/wh40k11ed/factions/space-marines/Captain) · [Hellblaster Squad](https://wahapedia.ru/wh40k11ed/factions/space-marines/Hellblaster-Squad)
- [Infernus Squad](https://wahapedia.ru/wh40k11ed/factions/space-marines/Infernus-Squad) · [Bladeguard Veteran Squad](https://wahapedia.ru/wh40k11ed/factions/space-marines/Bladeguard-Veteran-Squad)

Two units were considered and not taken:
- **Terminator Squad:** the page at this address showed the Deathwing (Dark Angels) variant with its own rules, not the generic datasheet.
- **Eradicator Squad:** the page's text mixed rules from different editions (Oath of Moment, the Melta keyword).

**Points** come from the Munitorum Field Manual values on Dakkapedia (2026-06-17), like the rest of the army builder:

| Unit | Points |
|---|---|
| Captain | 80 |
| Hellblaster Squad | 5 models: 110, 10 models: 220 |
| Infernus Squad | 5 models: 85, 10 models: 170 |
| Bladeguard Veteran Squad | 3 models: 80, 6 models: 160 (3rd+ unit: 90 / 170) |

Wahapedia's own prices differ, for example Captain 90. The project keeps one points source.

`src/game/__tests__/marines.test.ts` pins every characteristic and weapon profile below.

## Datasheets as implemented

M / T / Sv / W / Ld / OC (invulnerable save) · base. Default loadouts only.

| Model | Profile | Weapons |
|---|---|---|
| Captain | 6″ / 5 / 3+ / 5 / 6+ / 1 (4+) · 40 mm | Master-crafted Bolter 24″ A2 BS 2+ S5 AP −1 D2 (Rapid Fire 1, Assault); Heavy Bolt Pistol (BS 2+); Master-crafted Power Weapon A6 WS 2+ S6 AP −2 D2 |
| Hellblaster (and Sergeant) | 6″ / 5 / 3+ / 2 / 6+ / 1 · 32 mm | Plasma Incinerator 24″: standard A2 S7 AP −2 D2, supercharge S8 AP −3 D2 Hazardous (both Rapid Fire 1, Assault); Bolt Pistol; Ceramite Fists |
| Infernus Marine (and Sergeant) | 6″ / 5 / 3+ / 2 / 6+ / 1 · 32 mm | Pyreblaster 12″ A3 S5 AP −1 D1 (Torrent, Blast 1); Bolt Pistol; Ceramite Fists |
| Bladeguard Veteran (and Sergeant) | 6″ / 5 / 3+ / 3 / 6+ / 1 (4+) · 40 mm | Heavy Bolt Pistol; Master-crafted Power Sword A4 WS 3+ S5 AP −2 D2 |

The Bladeguard page puts the 4+ invulnerable save next to the Veteran only. Every Bladeguard model carries a storm shield, so the Sergeant gets it too.

Unit sizes: Captain 1; Hellblasters and Infernus 5 or 10; Bladeguard 3 or 6.

## Rules

| Rule | Unit | Status |
|---|---|---|
| Finest Hour | Captain | Once per battle, when the Captain fights: +3 A and Devastating Wounds for that fight. The unit card offers a separate “⭐ Finest Hour” fight action. The AI uses it on a vehicle, monster, character or a unit with 8+ wounds left. |
| Rites of Thermal Appeasement | Hellblasters | +1 to Hazardous rolls, so only a 1 fails. The dice panel shows the target as 2+. |
| Driven from Cover | Infernus | After the Infernus shoot and score at least one hit, the target gets no cover against this army's shooting until the end of the turn. The datasheet gives no duration. The AI shoots with the Infernus first so the rest of the army benefits. |
| Bladeguard | Bladeguard | The fight option: +1 to melee hit rolls when the unit fights. **The defensive option** (−1 to hit when the unit is attacked) **is not implemented**: the game has no decisions in the opponent's turn. |
| Strategic Acumen | Captain | **Not implemented**: the game has no Combat Doctrines (the 11th-edition Marine army rule). |
| Leader | Captain | The Captain joins a unit (Leader), the Lieutenant too (Support, it must). See [leaders.md](leaders.md). |

## Presets

The Marine presets in the army builder now use the new units:

- **500 (480 points):** Captain, Lieutenant, 5 Intercessors, 5 Hellblasters, 5 Infernus, 3 Bladeguard.
- **1000 (980 points):** Captain, 2 Lieutenants, 10 Intercessors, 10 Hellblasters, 5 Infernus, 6 Bladeguard, Redemptor.
- **1500, 2000, 2500:** see [armies.md](armies.md#presets-over-1000-points).

## AI

- **New Marine units** use the AI's full melee estimate, so the Bladeguard +1 to hit counts.
- **The Introductory Set and Combat Patrol units** keep the pinned legacy estimate.
- **Fight and shooting changes:** the new fight logic (Finest Hour) and the shooting order (Infernus first) only act when such units are present, so the golden-master games do not change.
