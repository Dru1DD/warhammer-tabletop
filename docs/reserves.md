# Strategic Reserves, Deep Strike, Rapid Ingress (44″×60″ battle)

Core Rules 20 of the 11th edition (Wahapedia). Code: `src/game/rules/reserves.ts`.

## Before the battle

On the 44″×60″ board the deployment panel has a «Strategic Reserves» block:

- the selected unit goes into reserve («⏬ to Reserves»);
- a unit in reserve comes back to the board («⏫ To the field») and has to be set up again.

**Limit.** At most half of the army's points (`reserveBudget`). At least one unit must start on the board.

**AI.** The AI keeps its Deep Strike units in reserve, within the limit. It does not hold other units back.

Reserve units live in `GameState.reserves`, off the board. The rest of the engine never sees them (targets, objectives, visibility, AI). A side whose units are all in reserve is not wiped out.

## Arrival (Ingress Move)

- **When.** From round 2, in your Movement phase, at any time in the phase (`arrive`). The reinforcements step is not a separate step here.
- **Where.**
  - Every model is wholly within 6″ of a battlefield edge.
  - Every model is more than 8″ from every enemy model.
  - The unit is in coherency, on the board, and does not overlap models or impassable terrain.
  - Before round 3, no model may be in the enemy deployment zone.
- **Deep Strike.** Anywhere on the board more than 8″ from the enemy, the enemy zone included. Units with Deep Strike: Swooping Hawks and the Winged Tyranid Prime.
- **After arriving.** The unit counts as having made a Normal move: no further move or Advance, and no Heavy bonus. It can shoot and charge.

**In the game.** The «⏬ Reserves» card in the action panel offers:

- **📍 Pick a spot on the field**: click on the board, and the game sets the unit up legally as close to the click as it can (`arrivalSpot`: a formation tried at up to 600 nearest points, in 8 orientations);
- **🎯 Set up at the objective**: the nearest legal spot to the objective it does not hold that is closest to the enemy.

## Rapid Ingress (1 CP)

- **When.** At the end of the opponent's Movement phase, from round 2, once per phase. It uses the existing reaction window `beforeShooting`.
- **Prompt.** When you have reserve units and CP, the reaction prompt shows «Rapid Ingress» with two choices: to the nearest objective, or «📍 Pick a spot».
- **Placement.** The same rules as a normal arrival.
- **AI.** The AI does not use Rapid Ingress. It brings its reserves in during its own Movement phase, from round 2.

## Deadline

At the end of round 3, units still in reserve are destroyed. They join the board's list as destroyed units, so kill cards and Meatgrinder count them, as the rules do.

## Not modelled

- Transports.
- AIRCRAFT.
- The 25% limit on units arriving in round 2 (from 10th edition; not found in 11th).

## Tests

`reserves.test.ts`:

- the points limit;
- the arrival rules (round, phase, edge, 8″, enemy zone);
- Deep Strike;
- the end of round 3;
- Rapid Ingress;
- a whole AI battle with one unit in reserve on each side.
