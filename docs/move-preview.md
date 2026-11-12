# Line of sight preview while moving

In the movement phase, select one of your units that has not moved yet. A panel in the top-left corner of the board, «👁 Если встать здесь» («С текущей позиции» before you drag), shows what happens if the unit ends its move there:

| Row | Meaning |
|---|---|
| 🎯 Сможете стрелять | enemy units this unit could shoot in the coming shooting phase, with the expected wounds and, when not all of them would fire, how many models do («стреляют 4 из 10») |
| ⚠ По «…» выстрелят только N из M | the best target is reached by fewer than half of the unit's models (terrain blocks the rest, or they are out of range): move so that the whole unit sees it |
| 👁 Видно, но не достать | enemy units it sees, but no weapon reaches (or only Assault weapons may fire after an Advance) |
| ⚠ По вам смогут стрелять | enemy units that could shoot it there in their next turn if they stay where they are, with the expected wounds |
| ⚔ Могут атаковать | enemy units that could charge it next turn, with the chance that the 2D6 roll covers the distance after their normal move |

On the board the same enemy units get rings, which the legend explains:

- **green dashed:** you can shoot it;
- **amber dotted:** you see it but cannot reach it;
- **red dotted:** it is a danger to you (it can shoot you, or charge you with a 30% chance or more).

The panel updates while you drag.

The firing count comes from the same `shootPlan` (`firingModels`: models with at least one weapon in range and sight). It was added after the battle analyses: a unit ending its move where only part of it sees the target was the most frequent slip (5 of 6 games).

## How it is computed

`src/game/movePreview.ts` is pure. It builds a copy of the state with the unit at the planned positions and the move mode it would use (normal, Advance or Fall Back, with the distance moved, so Heavy and Protector work as in the shooting phase). It then runs the engine's own `shootPlan` (line of sight, range, cover, Assault after Advance) in both directions. The expected wounds come from `expectedGroupDamage`, the average the AI uses.

The enemy is taken as it would stand at the start of its turn (not moved yet). For charges, the enemy first makes a normal move of its Move characteristic, which cannot end within Engagement Range. The chance is that of 2D6 reaching the rest, where a roll of 2 always fails, as in the engine. Terrain on the way is not taken into account, so the charge chance is an estimate.

## Charges from the planned spot

After a normal move, the panel also lists «🗡 Сможете атаковать (charge)» for up to three enemy units within 12″ of the planned spot:

- the distance;
- the chance on 2D6;
- the expected wounds;
- «добьёт» when that is enough to destroy the unit.

These come from the charge forecast of the Charge phase (`chargeAdvice.ts`), run on the planned positions. Dragging a unit a few inches closer to its target shows straight away how much the charge chance improves. There is no charge after an Advance or a Fall Back, so the line is not shown then.

## Stay in combat or fall back

For a unit locked in melee, the panel shows a verdict, «↩ Лучше выйти из боя» or «🛡 Лучше остаться в бою», with the reason and the numbers:

- **Staying:** expected wounds dealt to and taken from the enemies it is locked with, per fight.
- **Falling back:** no shooting this turn (core rules), then its best volley next turn.
- **The freed enemy:** what the enemy it held could charge instead, and how hard it would hit.

The verdict is «leave» in two cases. Either staying costs a third of the unit or more and it takes more than it deals. Or its guns next turn are worth at least twice its fists (and at least 1.5 wounds), and freeing the enemy costs less than that. Otherwise the unit holds the enemy, which is often right for cheap infantry tying up a monster or a walker.

`src/game/engagementAdvice.ts` is pure. Next turn's shooting is rated with `profileVs` from `weaponAdvice.ts`, without range, cover or line of sight.
