# Charge forecast and reminders

## Charge forecast

In the Charge phase, select a unit that has not declared a charge yet. Under its actions, «⚔ Прогноз атаки» lists every enemy unit within 12″:

- the distance to cover and the chance to roll it on 2D6;
- the expected wounds and models killed by your unit;
- the expected wounds and models killed in return.

Your unit fights first after charging. The enemy strikes back only with the models expected to survive.

Each line is marked ✅ (good), ⚠ (risky) or ⛔ (bad). The warnings say why:

- «Мало шансов дойти»: less than 30% to make the distance;
- «Невыгодный размен»: you would take more than you deal, and it costs a third of your unit or more;
- «Это стрелки»: a shooting unit locked in combat barely shoots next turn (pistols only), and it is weaker in melee.

The same line appears in the tooltip of an enemy model on the board.

`src/game/chargeAdvice.ts` is pure. It uses the AI's own `meleePotential` (now exported) and `p2d6AtLeast`, and `unitProfile` from `army/roles.ts` for the shooter check. All numbers are averages, not predictions of a roll.

### Who else fights back

Enemy units within 3″ of the target (`JOIN_RANGE`) end up in engagement range of the chargers. Only engaged units pile in, so farther ones usually stay out. These units fight at full strength, and their expected wounds are added to «в ответ». The forecast names them: «Рядом с целью «Лейтенант», «Штурмовые интерсессоры»: они окажутся в зоне контакта и тоже ударят — ещё ~10 ран по вам».

This comes from a played game, where Sicarians charged two Intercessors and were wiped out by the Captain and Bladeguard Veterans standing next to them.

### A character in a bad fight

A CHARACTER that would deal under 2 wounds, or lose half its wounds, gets its own warning: «… — персонаж: в этом бою он нанесёт ~2,4 ран, а получит ~4 из 4. С ним погибнут и его способности для армии». This also comes from played games: a Tech-Priest Dominus declared charges in four of five.

## Reminders

`endPhaseWarning` in `ui/guidance.ts` asks you to press «next phase» twice in two new cases:

- **Command phase without an Imperative (Adeptus Mechanicus).** It is free and chosen every turn.
- **Last round, ahead or level on points, moving first.** The opponent still has a turn, and a wiped-out army loses whatever the score, so at least one unit should hide behind obscuring ruins and more than 12″ from the enemy. In this situation the right panel also shows a red warning for the whole turn (`lastRoundWarning`).
