# Turn plan (44″×60″ battle)

A beginner cannot keep the cards in their head: what scores this turn, which objective is worth a fight, which card is about to pay. The «🧭 План хода» block at the top of the action panel says it in plain words. Code: `src/game/missionAdvice.ts`.

## What it shows

- **The primary mission now.**
  - «If you end the turn now: +N VP (why)». Shown in your own turn.
  - What your next Command phase would give if control stays as it is. Shown in both turns. In round 5 these lines move to the end of the turn, like the scoring.
- **Objectives to take** (up to three): «Возьмите Ц2 дом — ещё +15 ПО». The VP the next scoring moments would gain if that objective were yours.
- **Objectives to keep** (up to two): «Не отдавайте Ц4 — потеряете 5 ПО».
- **Actions.**
  - Units already acting: the action completes if you hold the objective, and there is a warning when you do not.
  - In the Shooting phase: every unit that can start the action now.
  - Earlier in the turn: a reminder to bring units to objectives.
- **Secondary cards.** «выполняется: +N ПО» with the reason, or what the card needs with the targets named. Examples:
  - the enemy units of 13+ models;
  - the characters;
  - the objectives in No Man's Land;
  - how many quarters are held.
- **Reserves.**
  - When they can arrive.
  - In round 3, a warning that units still in reserve will be destroyed.

**On the board.** Objectives carry «+N» (blue: VP for taking it) or «−N» (yellow: VP lost if the opponent takes it).

## How the numbers are made

The plan calls the same functions that score the mission:

- `commandEntries` and `turnEndEntries` in `rules/missions.ts` (the scoring was split into these pure functions for this);
- `cardOutlooks` in `rules/secondaries.ts`.

Both caps are applied (`cappedSum`), so the plan never promises what the game would not give.

**Stakes.** A take/keep stake is the difference in projected VP with the objective's controller switched (`objectiveStakes`).

## Tests

`missionAdvice.test.ts`:

- the projected Command-phase and end-of-turn VP equal what the game then scores;
- the stakes of the enemy home and of a held expansion on Outmanoeuvre;
- the opponent's turn;
- action, card and reserve lines;
- nothing on the training boards.
