# Тренировочный стол 40K

This is a browser tabletop trainer for **Warhammer 40,000 (11th edition)**, built around the two armies in the **Introductory Set**:
- Space Marines: a Lieutenant and 5 Intercessors
- Orks: a Nob and 5 Boyz

The «Боевой патруль» scenario adds a bigger battle on a 44″×30″ board: two Intercessor squads, Assault Intercessors and a Redemptor Dreadnought against three mobs of 10 Boyz and a Deff Dread, with ruins, woods, containers, barricades and craters.

Four more complete armies play on that large board: **Tyranids** (Hive Tyrant, 10 Termagants, 10 Hormagaunts, 3 Tyranid Warriors), **Necrons** (Overlord, 10 Necron Warriors, 3 Skorpekh Destroyers, 3 Canoptek Scarab Swarms), **Aeldari** (Farseer, 10 Guardian Defenders with their platform, 5 Dire Avengers, 3 Windriders) and **Adeptus Mechanicus** (Tech-Priest Dominus and Manipulus, 10 Skitarii Rangers, 10 Skitarii Vanguard, 3 Kataphron Breachers, 3 Kataphron Destroyers, 5 Sicarian Infiltrators, 3 Kastelan Robots). Any two of the six armies can fight each other; see [docs/armies.md](docs/armies.md) and [docs/mechanicus.md](docs/mechanicus.md).

You pick a faction and an opponent, and a rules-driven AI plays the other side. The interface is entirely in Russian.

It is a private hobby and learning project, not a Games Workshop product, and it ships no official images or rules text.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: engine, AI, persistence, transform and UI tests
npm run typecheck  # tsc -b (strict)
npm run lint       # oxlint
npm run build      # production build into dist/
```

Requires Node 20 or newer. Runs entirely in the browser: no backend, no external APIs.

## How to play

The board tells you what to do next. The banner at the top shows the next step, or the exact rule that blocks what you're trying. Units that can still act have a **green dashed ring**. Hover any model to see its stats and, against an enemy, its distance and whether you can attack it. Buttons for the current step sit **under the board**. Keys: **Enter** confirms a move, **Esc** cancels, **R** toggles the ruler.


1. On the start screen, choose a faction, scenario, AI level (Новичок / Стандарт) and a learning style: Пошагово (lessons), С подсказками (contextual help) or Самостоятельно (minimal text). Lesson progress is kept in this browser.
2. **Deployment:** «Начать новую битву» first opens the setup step. Optionally rearrange the battlefield in «0. Поле боя»: add ruins, walls or craters, drag them, change their size, rotate or delete them. The layout is remembered per scenario in this browser; «Вернуть тиррейн как в сценарии» restores the original. Drag your units inside the highlighted zone at your table edge and press «✓ Поставить» for each one, then «Начать битву ▶». The right panel shows your army, the placement rules, progress and anything still blocking the start. «Быстрый старт» skips this step.
3. **Movement:** select your unit and drag a model.
   - By default the whole unit moves together; turn off «Двигать отрядом целиком» to place models one at a time.
   - The dashed circle shows how far the model can go. Red highlighting plus a reason means the position is illegal.
   - Press «Подтвердить движение» to commit.
4. **Shooting / Charge / Fight:** with your unit selected, **click an enemy model**. Green highlight = legal target, red = hover to see why not.
   - Charge: press «🎲 Объявить атаку», then click a highlighted target.
   - Weapon profile choices (e.g. Focused Fire vs Saturation) are in the right panel.
5. **Dice:** every die appears in the «Кубики» tab at the bottom: hits, wounds, saves, damage and casualties, each with its target number and modifiers.
6. **Measuring:** «📏 Линейка» measures between two points or two models. Model-to-model distance is base edge to base edge. Enter a range to check whether a target is within it.
7. **Saving:** the game autosaves after every action and «Продолжить» on the start screen resumes it after a refresh. «Сохранить» / «Загрузить» use a separate manual slot. «Отменить» undoes actions that rolled no dice.

## Miniature art

Tokens use original SVG portraits (Ultramarine-style blue and gold Space Marines, green Orks). You can replace them with **photos of your own painted models** via «📷 Фото моделей» in the unit card. Official Games Workshop images are not bundled; see [docs/assets.md](docs/assets.md).

## Architecture

```
src/game/            pure TypeScript rules engine (no React)
  types.ts           state, commands, data types (positions in inches)
  data/              datasheets and weapon profiles
  geometry/          distances, base overlap, polygons, LOS sampling helpers
  dice/              seeded mulberry32 roller + scripted roller for tests
  combat/attack.ts   hit → wound → save → damage sequence with a full dice record
  rules/             movement validation and auto-placement, deployment, visibility and cover
  engine.ts          validate(state, cmd) / apply(state, cmd, roller), phase flow
  ai/ai.ts           utility AI: proposes commands, which still go through validate/apply
  scenarios/         scenario registry (2 scenarios)
  match/             command pipeline: controllers, envelopes, versioning, action history, replay, network boundary (types only)
  persistence.ts     versioned save format (format 2 = state + match block) with migrations
src/view/transform.ts  the only world (inches) ↔ screen (px) conversion
src/assets/manifest.ts token, terrain and board styles; resolves token art (photo → manifest → SVG)
src/assets/tokenArt.ts original SVG portraits
src/ui/guidance.ts   next-step hints, actionable units, click-to-target (pure, tested)
src/store.ts         Zustand orchestration: publishes the match state, UI state, undo snapshots, AI stepping, save/load
src/ui/              Konva board and React panels
```

- Commands are typed. `apply` validates first, then works on a `structuredClone`, so an invalid command never mutates state.
- The RNG state lives inside `GameState`, so saved games and tests replay deterministically.
- The AI and the human use the same path: every command is a `CommandEnvelope` that goes through `match.submit` (ownership, sequence, state version, then `validate`/`apply`). The AI has a per-turn action cap as a guard against loops.
- Multiplayer readiness (no networking yet): see [docs/architecture.md](docs/architecture.md).

## What's implemented

The full list, with what is exact and what is approximated, is in [docs/research.md](docs/research.md).

- Battle rounds and phases, roll-off for first turn, CP gain, battle-shock (persists until passed).
- Normal Move, Advance (with Waaagh! re-roll), Fall Back (with Desperate Escape).
  - Movement limits: M, board edges, base overlap, enemy bases, engagement range, coherency.
- Shooting with line of sight, range measured base edge to base edge, and cover (−1 BS).
- Weapon keywords: Rapid Fire, Heavy, Assault, Close-quarters, Blast, Lethal Hits, Hazardous, plus wound allocation rules.
- Charge: 2D6 roll, then target selection; Fights First; pile-in; alternating fight order; consolidation.
- Unit abilities: Bolter Discipline, Tactical Precision, Ammo Runts, Tide of Muscle, Waaagh! War Cry.
- Six armies with their army rules: Tyranid Synapse and Shadow in the Warp, Necron Reanimation Protocols, Aeldari Battle Focus (Swift as the Wind) and Guide, Adeptus Mechanicus Doctrina Imperatives (Protector / Conqueror), plus the datasheet abilities and weapon keywords they need (Twin-linked, Extra Attacks, Devastating Wounds, Sustained Hits, Anti-X, Psychic, One Shot, FLY, Feel No Pain, Ignores Cover, Stealth). Details and the explicit list of what is not implemented: [docs/armies.md](docs/armies.md).
- Objective control by OC, end of game after 5 rounds or when an army is destroyed.
- AI with two levels, faction-specific weights and Russian explanations of each decision.
- 7-step tutorial that runs on the real engine, and three explanation levels.

## Known limitations

- **Unofficial training mission.** Scoring is 5 VP per objective held from round 2. The handbook's missions were not available.
- **Training-size Ork unit.** The 6-model Boyz unit is below the datasheet minimum of 10, and the box's special weapons exceed the datasheet allowance. The UI flags this.
- **The Lieutenant is a separate unit** rather than attached to the Intercessors.
- **No stratagems, Combat Doctrines, Hidden, vertical terrain, Overrun or reserves.** CP accumulate but can't be spent.
- **Approximations** (see research.md):
  - Line of sight is sampled.
  - Hit modifiers are capped at ±1.
  - Cleave and half-strength use assumed definitions.
  - Charge, pile-in and consolidation moves are placed automatically.
- **Balance.** With the official profiles, the Space Marines win almost every AI-vs-AI game: 75 of 80 games, see research.md. Playing as Orks is hard. Use «Переулок в руинах» and stay behind ruins. Balance of all six armies: docs/armies.md.
- **New armies: not implemented** (the engine has no out-of-turn moves, stratagems or attached leaders): Skulking Horrors, Fade Back and the other reactive Agile Manoeuvres, Fleet of Foot, Will of the Hive Mind, My Will Be Done, Branching Fates, Sentinel Directives, Scouts 6″. Each is marked in the unit card. The Mechanicus Doctrina Imperatives and Tech-Priest leaders are training approximations (docs/mechanicus.md).

## Docs

- [docs/architecture.md](docs/architecture.md): command pipeline, ownership, versioning, replay, persistence, future networking boundary.
- [docs/armies.md](docs/armies.md): the Tyranid, Necron and Aeldari armies: sources, legality notes, rules abstractions, limitations, AI behaviour, balance of all six armies.
- [docs/mechanicus.md](docs/mechanicus.md): the Adeptus Mechanicus army: 11th-edition sources, legality, datasheets, Doctrina Imperatives, approximations, AI, artwork.
- [docs/orks.md](docs/orks.md): the extra Ork units for army lists (Warboss, Nobz, Gretchin, Kommandos): sources, points, rules and what is not implemented.
- [docs/research.md](docs/research.md): edition, sources, box contents, datasheets, exact vs approximated rules.
- [docs/assets.md](docs/assets.md): asset inventory and licensing.

## Online play (two humans)

PeerJS / WebRTC, host-authoritative, no backend of our own. See [docs/multiplayer.md](docs/multiplayer.md) for the architecture, signaling/STUN/TURN setup, limits and a manual two-browser test plan.
