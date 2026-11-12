# The 44″×60″ battlefield

The full-size board of 11th edition matched play, as the scenario «Битва 44″×60″ (карты 11-й редакции)» (`strike-force`). Each battle uses a deployment map and a terrain layout, both chosen on the start screen; each can also be random. The header shows them («🗺 Молот и наковальня»). Code: `src/game/scenarios/strikeForce.ts`.

## Deployment maps

The six deployment cards of the Mission Deck 2026-27. The cards show zones and objectives only as pictures, so the positions here follow the 10th edition maps of the same names and are approximate.

| Map | Board | Deployment zones |
|---|---|---|
| Молот и наковальня (Hammer and Anvil) | 60″×44″ | 18″ strips along the short edges |
| Рассвет войны (Dawn of War) | 44″×60″ | 12″ strips along the long edges |
| Найти и уничтожить (Search and Destroy) | 60″×44″ | opposite quarters, minus 9″ around the centre |
| Широкий охват (Sweeping Engagement) | 44″×60″ | stepped strips along the long edges: 8″, then 14″ |
| Горнило битвы (Crucible of Battle) | 60″×44″ | triangles in opposite corners |
| Переломный момент (Tipping Point) | 60″×44″ | stepped strips along the short edges: 12″, then 20″ |

The engine looks «forward» along the x axis (west against east), so every map is drawn with the players facing west–east: maps with zones on the long edges use a board 44″ wide. Everything is point-symmetric about the centre.

**Five objectives** on every map, each with a role for missions (`Objective.role`):

- **home** («дом»): one per player, inside its zone (`Objective.home`);
- **central** («центр»): the middle;
- **expansion** («фланг»): two on the flanks, in No Man's Land.

Each player's half of the board is its territory (`GameState.territory`). The zones of the battle are kept in the state (`GameState.deployment`), and `deploymentZone` reads them first.

## Terrain layouts

Three layouts, drawn on the 60″×44″ board and transposed for the 44″×60″ maps, each point-symmetric:

- **A — «Руины мануфактории»**: ruins, woods and a container around a ruined centre.
- **B — «Лесистые холмы»**: woods and craters, a wooded centre.
- **C — «Городские развалины»**: dense ruins.

No objective sits in a container or a barricade. The terrain editor's saved layout is not used on this board, because the board changes with the map.

## Layouts of the 44″×30″ board (Combat Patrol)

«Боевой патруль» also gets a layout picker:

- **A — «Классика (как раньше)»**: the original layout, still the default. The terrain editor's saved layout applies only with A.
- **B — «Лесная опушка»** and **C — «Развалины улиц»**: new, point-symmetric (`patrolLayout`).
- **Random.**

The new pieces stay between x 11″ and 33″, so the training rosters keep their fixed spots in the zones.

## Armies

Own lists from the army builder. A side without a list plays its 1000-point preset. Both armies start in the deployment preset that suits them, as on «Боевой патруль».

## Reserves

Up to half of the army may wait in Strategic Reserves and arrive from round 2 (see [reserves.md](reserves.md)).

## Scoring

A primary mission of the 11th edition, both sides playing the same one (see [missions.md](missions.md)). The «Учебный счёт» option keeps the training rule, 5 VP per objective.

## Tests

`strikeForce.test.ts`:

- zones inside the board and equal on both sides;
- five objectives, with the homes in their zones;
- no objective in a container or a barricade;
- every army at 1000 points fits legally on every map and layout (54 builds).

AI against AI: full games on «Горнило битвы» and «Найти и уничтожить», 1–2 minutes each in Node.
