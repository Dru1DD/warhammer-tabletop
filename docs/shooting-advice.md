# Shooting advice and weapon hints

Two hints for players who are still learning what each weapon is for.

## What a weapon is good at

Every weapon row in the unit card (left panel) gets short lines under its name:

- 👥 / 🛡 / 🔨 “Best against…”: hordes of infantry, armoured infantry, or vehicles and monsters;
- 🔨 “Pierces vehicles and monsters”: it reliably wounds big targets;
- ⚠ “Almost useless against vehicles and monsters”: it barely scratches them;
- 💥 Devastating Wounds and 🎯 Anti-X explained in words.

`src/game/weaponAdvice.ts` computes the expected result per firing model against three reference targets:

| Reference | Toughness | Save | Wounds | Example |
|---|---|---|---|---|
| a horde | T3 | Sv5+ | W1 | Termagants, Gretchin |
| armoured infantry | T4 | Sv3+ | W2 | Intercessors |
| a big vehicle or monster | T10 | Sv2+ | W12 | Redemptor, Carnifex |

It uses the same dice maths as the engine: hit, wound, save and damage, with Sustained and Lethal Hits, Devastating Wounds and Blast. “Best against” is the target kind where the weapon does best compared with a typical weapon. Anti-X is left out of the ratings, because it helps against one keyword only, and gets its own line.

## Which target to shoot

In the shooting phase, under every “Shoot at …” button and in the target's tooltip on the board:

- “≈ 4.7 wounds → ~5 of 10 models”: expected wounds and models killed;
- ★ and “best target” on the target that loses the most wounds, counting only the wounds it has left;
- ⚠ “Overkill”: the expected damage is far above what the target has left while another target is worth shooting, so a weaker unit should finish it;
- ⚠ “Weak”: another target would take several times more damage.

In the attack breakdown, a weapon that barely wounds vehicles and monsters is flagged when the target is one.

`src/game/shotAdvice.ts` runs the engine's `shootPlan` for every enemy unit and averages the dice with `expectedGroupDamage`, the same function the AI uses. All numbers are averages, not predictions of a roll.
