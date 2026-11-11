# Line of sight preview while moving

In the movement phase, select one of your units that has not moved yet. A panel in the top-left corner of the board, «👁 Если встать здесь» («С текущей позиции» before you drag), shows what happens if the unit ends its move there:

| Row | Meaning |
|---|---|
| 🎯 Сможете стрелять | enemy units this unit could shoot in the coming shooting phase, with the expected wounds |
| 👁 Видно, но не достать | enemy units it sees, but no weapon reaches (or only Assault weapons may fire after an Advance) |
| ⚠ По вам смогут стрелять | enemy units that could shoot it there in their next turn if they stay where they are, with the expected wounds |
| ⚔ Могут атаковать | enemy units that could charge it next turn, with the chance that the 2D6 roll covers the distance after their normal move |

On the board the same enemy units get rings, which the legend explains:

- **green dashed:** you can shoot it;
- **amber dotted:** you see it but cannot reach it;
- **red dotted:** it is a danger to you (it can shoot you, or charge you with a 30% chance or more).

The panel updates while you drag.

## How it is computed

`src/game/movePreview.ts` is pure. It builds a copy of the state with the unit at the planned positions and the move mode it would use (normal, Advance or Fall Back, with the distance moved, so Heavy and Protector work as in the shooting phase). It then runs the engine's own `shootPlan` (line of sight, range, cover, Assault after Advance) in both directions. The expected wounds come from `expectedGroupDamage`, the average the AI uses.

The enemy is taken as it would stand at the start of its turn (not moved yet). For charges, the enemy first makes a normal move of its Move characteristic, which cannot end within Engagement Range. The chance is that of 2D6 reaching the rest, where a roll of 2 always fails, as in the engine. Terrain on the way is not taken into account, so the charge chance is an estimate.
