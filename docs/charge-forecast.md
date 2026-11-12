# Charge forecast and reminders

## Charge forecast

In the Charge phase, select a unit that has not declared a charge yet. Under its actions, “⚔ Charge forecast” lists every enemy unit within 12″:

- the distance to cover and the chance to roll it on 2D6;
- the expected wounds and models killed by your unit;
- the expected wounds and models killed in return.

Your unit fights first after charging. The enemy strikes back only with the models expected to survive.

Each line is marked ✅ (good), ⚠ (risky) or ⛔ (bad). The warnings say why:

- “Little chance to make it”: less than 30% to make the distance;
- “Bad trade”: you would take more than you deal, and it costs a third of your unit or more;
- “These are shooters”: a shooting unit locked in combat barely shoots next turn (pistols only), and it is weaker in melee.

The same line appears in the tooltip of an enemy model on the board.

`src/game/chargeAdvice.ts` is pure. It uses the AI's own `meleePotential` (now exported) and `p2d6AtLeast`, and `unitProfile` from `army/roles.ts` for the shooter check. All numbers are averages, not predictions of a roll.

### Who else fights back

Enemy units within 3″ of the target (`JOIN_RANGE`) end up in engagement range of the chargers. Only engaged units pile in, so farther ones usually stay out. These units fight at full strength, and their expected wounds are added to «in return». The forecast names them: «Near the target “Lieutenant”, “Assault Intercessors”: they will end up in engagement range and strike too — another ~10 wounds to you».

This comes from a played game, where Sicarians charged two Intercessors and were wiped out by the Captain and Bladeguard Veterans standing next to them.

### A character in a bad fight

A CHARACTER that would deal under 2 wounds, or lose half its wounds, gets its own warning: «“Tech-Priest Dominus” is a character: in this fight it will deal ~2.4 wounds and take ~4 of 4. Its abilities for the army die with it». This also comes from played games: a Tech-Priest Dominus declared charges in four of five.

## Reminders

`endPhaseWarning` in `ui/guidance.ts` asks you to press «next phase» twice in two new cases:

- **Command phase without an Imperative (Adeptus Mechanicus).** It is free and chosen every turn.
- **Last round, ahead or level on points, moving first.** The opponent still has a turn, and a wiped-out army loses whatever the score, so at least one unit should hide behind obscuring ruins and more than 12″ from the enemy. In this situation the right panel also shows a red warning for the whole turn (`lastRoundWarning`).

## Asking before a risky charge

The battles showed that the forecast is easy to ignore. Charges from 11″ (3%), a support Tech-Priest charging next to a Captain, shooters charging into melee.

So pressing “🎲 Declare a charge (2D6)” first asks “Really charge with …?” when `chargeWarning` (`src/game/chargeAdvice.ts`) finds a reason:

- **every target out of reasonable reach**: the best chance to get there is below 30% (`LOW_CHARGE_CHANCE`);
- **every possible fight a bad trade** (verdict `bad`);
- **a shooter or a character** whose best fight is not a good one.

**The dialog** lists those reasons (with the forecast's own warnings). “Cancel” is the default button, so Enter or Esc keeps the unit back. “Charge anyway” declares the charge.

**Where it lives.** The check sits in the store's `dispatch`, so it covers every charge button: the action bar under the board and the unit's action list. It is skipped in the «minimal» explanation mode. The AI never goes through it.
