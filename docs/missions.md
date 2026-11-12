# Primary missions (44″×60″ battle)

The «Битва 44″×60″» scenario is played for a primary mission. The cards come from the Mission Deck 2026-27 (Chapter Approved, Wahapedia). Both sides play the same card, as in the **Mirrored World** twist: Battlefield Dominance, Meatgrinder, Outmanoeuvre, Gather Intel or Sabotage.

The start screen offers:

- **Random** (the default, like the twist's D6 roll);
- one of the five cards;
- **«Учебный счёт»**: the old training rule, 5 VP per objective from round 2.

The 44″×30″ board keeps the training score.

Code: `src/game/rules/missions.ts`. The engine calls its hooks:

- `missionCommandEnd` at the end of a Command phase;
- `missionTurnStart` and `missionTurnEnd` at the start and end of a turn;
- `missionBattleEnd` at the end of round 5.

## Objectives

The maps give each objective a role:

- **home**: one in each deployment zone;
- **central**;
- **expansion**: the two flanks.

**Territory** is each player's half of the board. An objective on the middle line belongs to neither half.

## The cards

| Card | How it scores |
|---|---|
| Господство на поле (Battlefield Dominance) | R1–2, end of turn: 2 if you hold more objectives. R2+, end of Command phase: 3 per objective, +2 per non-home objective while your home is held |
| Мясорубка (Meatgrinder) | End of turn: 3 if an enemy unit died this turn. R2+, end of turn: 5 if more enemy units died than you lost in the previous turn. R2+, end of Command phase: 4 for a non-home objective. End of battle: 5 for the enemy home |
| Обходной манёвр (Outmanoeuvre) | End of turn: 10 for the enemy home. R1, end of turn: 4 per non-home objective. R2–3, end of Command phase: 5 each. R4+, end of turn: 6 each |
| Сбор разведданных (Gather Intel) | R1, end of turn: 6 for a central objective. R2+, end of Command phase: 4 for a non-home objective. R2+, end of turn: 7 per completed «Добыть сведения». End of battle: 5 for 3+ operation markers, 5 for a marker at the enemy home |
| Диверсия (Sabotage) | End of turn: 3 per unit that committed sabotage, +2 each if it is at an objective in enemy territory. R2+, end of Command phase: 4 for a non-home objective |

**Round 5.** The card says «end of your Command phase, or end of your turn in round 5». The game reads this as: rounds 2–4 score at the end of the Command phase, round 5 at the end of the turn.

**Caps.** A player scores at most 15 primary VP per round and 45 per battle. End-of-battle VP are outside the round cap (FAQ) but inside the 45. If a cap cuts the VP, the log says so.

**Previous turn.** «Lost in the previous turn» means the opponent's turn just before yours. Units count, not models.

## Actions

Two cards have an objective action:

- Gather Intel: **«Добыть сведения» (Extract Intelligence)**, from round 2;
- Sabotage: **«Диверсия» (Sabotage)**, from round 1.

**Starting.** Use the button in the unit's actions in the Shooting phase («🛰 Действие … у цели Цn»). The unit must:

- be within 3″ of the objective;
- not be at its own home objective;
- not be battle-shocked;
- not have OC 0;
- not be engaged;
- not have advanced or fallen back;
- not have shot.

Only one of your units per objective. For Extract Intelligence, the objective must not already have your operation marker.

**While acting.** The unit does not shoot or declare a charge this turn.

**Completing.** At the end of your turn, if the unit is alive, still near the objective, and you control it:

- Extract Intelligence puts your operation marker there (a diamond in your colour on the board);
- Sabotage counts as committed.

Otherwise the action fails. The log says either way.

The core rule also breaks an action when the unit moves. In this game nothing can move the unit between its Shooting phase and the end of its turn, except pile-in and consolidation, which do not break it. So this rule is not modelled. Reserves (Ingress) will need it.

## In the game

- The header shows «🎯 <card>».
- The action panel has the card:
  - its text;
  - the primary VP by round, the end of battle and the total out of 45;
  - who is acting;
  - the markers.
- Objective labels say «дом», «центр» or «фланг».

## AI

- **Movement.** Objectives are weighted by the card, as `objectiveWorth`:
  - the enemy home is worth more on Outmanoeuvre, Meatgrinder and Gather Intel;
  - your own home is worth more on Dominance and less elsewhere.
- **Shooting.** A unit at an objective its side holds starts the action instead of shooting when the action's VP are at least 0.8 of the volley's expected damage:
  - Extract Intelligence: 7;
  - Sabotage: 3, or 5 in enemy territory.

Without a mission both rules return the old values, so the training scenarios and their fingerprints (golden, aiEquivalence) do not change.

## Tests

`missions.test.ts`:

- choosing the mission;
- each card's scoring;
- both caps;
- the end of the battle;
- the action rules (start, block, completion, markers);
- the AI starting an action;
- a full AI-vs-AI battle on Sabotage.
