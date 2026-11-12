# Secondary missions (44″×60″ battle)

The game has the 16 secondary cards of the Mission Deck 2026-27 that need no actions. Plunder and Cleanse are left out.

Code: `src/game/rules/secondaries.ts`. The engine calls:

- `secondaryCommandStart` at the start of the Command phase, to draw cards;
- `secondaryTurnEnd` at the end of every turn, to score.

## Tactical and Fixed

The start screen sets the human player's mode:

- **Tactical** (the default). The deck is shuffled when the battle is built. At the start of each of your Command phases you draw up to two active cards. Cards score at the end of a turn and an achieved card is put away.
- **Fixed.** Two cards chosen on the start screen, active all battle, never discarded, at most 20 VP each. The Fixed cards are the four whose card gives Fixed values:
  - Assassination;
  - Bring It Down;
  - A Grievous Blow;
  - Engage on All Fronts.
- **Без вторичных** turns secondaries off for both sides.

The AI always plays Tactical.

## Your choices with Tactical cards

These are buttons in the «🃏 Вторичные» panel.

- **🔄 Swap for 1 CP.** Once per battle, in your Command phase: discard a card and draw a new one.
- **🗑 Discard at the end of the turn for +1 CP.** Marks a card. At the end of your turn, after scoring, a marked card that was not achieved is discarded for 1 CP. An achieved card scores instead. Press again to unmark.

## Scoring

At the end of each turn the active player's cards are checked first, then the opponent's.

- **Any turn** (kill cards: No Prisoners, Overwhelming Force, A Grievous Blow, Bring It Down, Assassination): what died in that turn, in either player's turn.
- **End of your turn**: Outflank, Engage on All Fronts, Secure No Man's Land, Forward Position, Centre Ground, A Tempting Target, Behind Enemy Lines.
- **End of the opponent's turn, or of round 5**: Beacon, Defend Stronghold, Burden of Trust.
- **Display of Might**: 2 VP at the end of your turn, or 5 VP at the end of the opponent's.

**Caps.** Secondaries score at most 45 VP per battle and 15 per round. Cards marked «up to 5» score at most 5 each time.

## «When drawn» choices

The game makes these for both sides.

- **Defend Stronghold, Forward Position, Behind Enemy Lines** drawn in round 1 go back to the bottom of the deck and another card is drawn.
- **A Grievous Blow** (no enemy unit of 13+ models) and **Bring It Down** (no enemy model with 10+ wounds) are discarded and replaced.
- **Beacon**: the beacon is the fastest unit.
- **A Tempting Target**: «the opponent» picks the No Man's Land objective (not a home) farthest from the drawing player's zone.
- **Burden of Trust**: when drawn and at the start of each of your turns, each objective you control gets one of your units in range as its guard.

## Terms

- **No Man's Land**: outside both deployment zones. «Wholly within» means every model's centre.
- **Quarters**: the board split at its centre lines. A unit counts for a quarter if it is wholly in it and every model is more than 6″ from the centre.
- **Eligible unit**: not battle-shocked. There are no AIRCRAFT in the game.

## Interpretations

- Forward Position: «the enemy home **or** both expansion objectives».
- Grievous Blow and Bring It Down Fixed: 4 VP per kill, with no cap of 5 per scoring.
- A Fixed card scores at most 20 VP in a battle.

## AI

- **Movement.** Active cards add goals to the AI's moves, with a bonus for standing there:
  - the centre (Centre Ground);
  - the enemy zone (Behind Enemy Lines);
  - the tempting objective;
  - the enemy home and the flanks (Forward Position);
  - No Man's Land objectives.
- **Stale cards.** A card held unscored for two of its turns is marked for discarding at the end of the turn, for 1 CP.
- **Swaps.** The AI does not use the 1 CP swap.

Without secondaries the AI is unchanged, so the golden and aiEquivalence fingerprints stay the same.

## Tests

`secondaries.test.ts`:

- set-up;
- drawing and the round-1 replacements;
- the kill cards, Behind Enemy Lines, Centre Ground and Defend Stronghold timing;
- Fixed caps and the round cap;
- swap and discard.

The full AI battle in `missions.test.ts` also checks secondaries.
