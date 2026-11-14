# Tyranids: units beyond the first four

The Tyranids had a Hive Tyrant, Termagants, Hormagaunts and Tyranid Warriors. Four more units are now available in the army builder: Winged Tyranid Prime, Zoanthropes, Carnifexes and Barbgaunts. The training rosters are unchanged.

## Edition and sources

Everything targets **11th edition**. Each datasheet was read from Wahapedia's 11th-edition transcription (Tyranids Faction Pack v1.3) on **2026-11-10**. It is a community source, **not the official PDF**.

- [Winged Tyranid Prime](https://wahapedia.ru/wh40k11ed/factions/tyranids/Winged-Tyranid-Prime) · [Zoanthropes](https://wahapedia.ru/wh40k11ed/factions/tyranids/Zoanthropes)
- [Carnifexes](https://wahapedia.ru/wh40k11ed/factions/tyranids/Carnifexes) · [Barbgaunts](https://wahapedia.ru/wh40k11ed/factions/tyranids/Barbgaunts)

Two units were considered and not taken:
- **Neurogaunts:** the Nodebeast has no profile on the page, and the listed sizes (11 / 22) do not match the composition text.
- **Von Ryan's Leapers:** they need Fights First as a datasheet ability and a stratagem.

**Points** come from the Munitorum Field Manual values on Dakkapedia (2026-06-17):

| Unit | Points |
|---|---|
| Winged Tyranid Prime | 65 |
| Zoanthropes | 3 models: 100, 6 models: 200 |
| Carnifexes | 1 model: 90, 2 models: 180 |
| Barbgaunts | 5 models: 55, 10 models: 110 |

`src/game/__tests__/tyranidsExtra.test.ts` pins every characteristic and weapon profile below.

## Datasheets as implemented

M / T / Sv / W / Ld / OC (invulnerable save) · base. Default loadouts only.

| Model | Profile | Weapons |
|---|---|---|
| Winged Tyranid Prime | 12″ / 5 / 4+ / 6 / 7+ / 1 · 50 mm, FLY, SYNAPSE | Prime Talons A6 WS 2+ S6 AP −1 D2 |
| Zoanthrope, Neurothrope | 5″ / 5 / 5+ / 3 / 7+ / 1 (4+) · 40 mm, FLY, SYNAPSE | Warp Blast 24″: witchfire D3 attacks, S7 AP −2 D D3, Blast, Psychic; focused witchfire A1, S12 AP −3 D D6+1, Lethal Hits, Psychic; claws and teeth |
| Carnifex | 8″ / 9 / 2+ / 8 / 8+ / 3 · 86 mm (see below), MONSTER | Scything Talons A6 WS 4+ S9 AP −2 D3, plus Extra Scything Talons A2 (Extra Attacks) |
| Barbgaunt | 6″ / 4 / 4+ / 2 / 8+ / 1 · 40 mm | Barblauncher 24″ D6 attacks, S5 AP 0 D1, Blast, Heavy; claws and teeth |

Two simplifications:
- **Carnifex base.** The datasheet base is a 105×70 mm oval, but the engine has only round bases. The Carnifex uses an 86 mm round base, which has the same area.
- **Neurothrope profile.** The unit is 1 Neurothrope and 2–5 Zoanthropes. The page gives no separate Neurothrope profile, so it uses the Zoanthrope's.

Unit sizes: Prime 1; Zoanthropes 3 or 6; Carnifexes 1 or 2; Barbgaunts 5 or 10.

## Rules

| Rule | Unit | Status |
|---|---|---|
| Synapse, Shadow in the Warp | Prime, Zoanthropes | The Prime and the Zoanthropes have the SYNAPSE keyword, so they extend Synapse Range as the Hive Tyrant does. The Prime also carries Shadow in the Warp. |
| Alpha Warrior | Prime | While the Prime leads Tyranid Warriors, their weapons have Sustained Hits 1. **Approximation**, the same one the Tech-Priests use: there is no leader attachment, so a Prime within 3″ of a Tyranid Warriors unit counts as leading it, and both the Prime and the Warriors get Sustained Hits 1. |
| Warp Field | Zoanthropes | Aura: friendly Tyranid units within 6″ (and the Zoanthropes themselves) have a 6+ invulnerable save. The better save is always used. |
| Disruption Bombardment | Barbgaunts | After shooting, an INFANTRY target they hit gets −2″ Move and −2 to Advance and Charge rolls until the end of its owner's next turn. MONSTER and VEHICLE targets are not affected. |
| Deadly Demise 1 | Carnifexes | As for the other vehicles and monsters. |
| Death Blow | Prime | **Not implemented**: no out-of-sequence fighting. |
| Spirit Leech | Zoanthropes | **Not implemented.** |
| Blistering Assault | Carnifexes | **Not implemented**: no reactions in the opponent's turn. |
| Deep Strike | Prime | **Not implemented**: there are no reserves. |

## Presets

The Tyranid presets in the army builder now use the new units:

- **500 (480 points):** Winged Prime, 3 Tyranid Warriors, 20 Termagants, 3 Zoanthropes, 1 Carnifex, 5 Barbgaunts.
- **1000 (1000 points):** Hive Tyrant, Winged Prime, 6 Tyranid Warriors, 20 Termagants, 20 Hormagaunts, 3 Zoanthropes, 2 Carnifexes, 10 Barbgaunts.
- **1500, 2000, 2500:** see [armies.md](armies.md#presets-over-1000-points).

## AI

There is no special AI for these units:
- **Ranged weapons:** the shooting estimate already counts Warp Blast's two profiles, Sustained Hits and the disruption-free damage.
- **Warp Field:** it is part of the save the AI expects.
- **Disruption:** the AI's movement reach shrinks for disrupted units.
