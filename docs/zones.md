# Auras and ability zones on the board

Several abilities work within a distance of a unit: the Onager's Emanatus Force Field, Synapse, a Tech-Priest leading a unit. The board draws these zones and marks the units they affect (#59).

Code:
- `src/game/rules/zones.ts`: the registry of zones;
- `src/view/zones.ts`: shapes, outline, badges and drag notes;
- `src/ui/Board.tsx`: drawing;
- `src/ui/Panels.tsx`: the unit card.

Tests: `src/game/__tests__/zones.test.ts` and `src/view/zones.test.ts`.

## The zones

The datasheets were checked against Wahapedia (11th edition) on 13.11.2026. Of the 61 datasheets in the game, five units have an ability marked Aura. The other zones work the same way without the keyword.

| Zone | Source | Range | Affects | Badge |
|---|---|---|---|---|
| Rad-saturation (Aura) | Skitarii Vanguard | 3″ | enemy units except VEHICLE | −1 OC |
| Neurostatic Interference (Aura) | Sicarian Infiltrators | 6″ | enemy units | −1 Ld, or −2 Ld when the Sicarians are near friendly BATTLELINE |
| Emanatus Force Field (Aura) | Onager Dunecrawler | 6″, each model wholly within | friendly Adeptus Mechanicus BATTLELINE models | 4++ (with "3/10" when only some models are covered) |
| Onslaught (Aura) | Hive Tyrant | 6″ | friendly Tyranids, the Tyrant too | Assault, Lethal |
| Warp Field (Aura) | Zoanthropes | 6″ | friendly Tyranids, the Zoanthropes too | 6++ |
| Synapse | SYNAPSE units | 6″ | friendly Tyranids | Synapse (only while its zone is drawn: it covers nearly every Tyranid) |
| Near Battleline | Skitarii Rangers and Vanguard | 6″ | Kataphron Breachers (re-roll hits), Serberys Sulphurhounds (Line-breakers +2), Sicarians (−2 Ld), any Mechanicus unit under the Conqueror Imperative (AP +1) | as listed |
| Psychic Guidance | an Aeldari PSYKER (Farseer) | 12″ | Wraithguard | +1 to hit |
| Leads a unit | Tech-Priest Dominus and Manipulus; a Necron NOBLE | 3″ | the unit it leads (the game's approximation of attached leaders) | FNP 5+, Lethal Hits, −1 to wound |
| Deadly Demise | vehicles and monsters | 6″ | every unit, if the model is destroyed and explodes | none; drawn on hover only |

Not drawn:
- Spirit Leech (Zoanthropes) is not implemented.
- One-off abilities with a chosen target (Guide, Bomb Squig, Grenade Pack Flyover) are not zones.

## How the board shows them

- **A selected unit** shows its zones, of either side.
- **The unit under the pointer** shows its zones, and its Deadly Demise.
- **Show all zones** (in the legend) draws every zone of both sides. It is off by default.
- **Colours:**
  - teal: a bonus for the source's side;
  - red: a penalty for the enemy;
  - yellow: a leader;
  - orange: an explosion.
- **Badges** above each affected unit name the effect, for example "4++" on Rangers inside the Onager's field. They are always shown, except Synapse.
- **While a unit is dragged** its zones move with it. The movement panel says whom they will cover from there, and which zones the unit enters or leaves.
- **The unit card** lists the zones the unit stands in ("Affected by") and whom its own zones cover.

A zone is measured from the edge of each model's base, so it is drawn as one circle per model: the range plus the base radius. The circles are filled as one shape, so overlaps do not get darker. The outline is their outer edge only, and it stops at the edge of the table.

## One registry, the rules where they were

`ZONES` describes each zone:
- its source;
- its range, and how the range is measured (from the base edge, or each model wholly within);
- which side it affects;
- the badge it gives a unit.

The UI reads only the registry. The rules stay in their own functions (`emanatusModels`, `neurostaticMod`, `inOnslaught`, `warpField`, `inSynapseRange`, `battlelineSupport`, `psychicGuidance`, `ledUnitOf`, `nobleLeads`, `irradiated`). `zones.test.ts` moves a target unit away from each source in small steps and checks that the registry and the rule agree at every step.

## Emanatus Force Field: each model wholly within

The Onager protects each Adeptus Mechanicus BATTLELINE model that is **wholly** within 6″ of it (every part of its base). Until #59 the whole unit got the 4+ when any model was within 6″. Now the shooting context carries a per-model invulnerable save (`AttackContext.invulnByModel`, read with `invulnFor`). A model at the edge of the field rolls its own save, without the 4+. The golden and aiEquivalence games do not change.
