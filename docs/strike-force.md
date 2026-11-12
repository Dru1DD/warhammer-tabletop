# The 44″×60″ battlefield

The full-size board of 11th edition matched play, as the scenario «Battle 44″×60″ (11th edition maps)» (`strike-force`). Each battle uses a deployment map and a terrain layout, both chosen on the start screen; each can also be random. The header shows them («🗺 Hammer and Anvil»). Code: `src/game/scenarios/strikeForce.ts`.

## Deployment maps

The six deployment cards of the Mission Deck 2026-27. The cards show zones and objectives only as pictures, so the positions here follow the 10th edition maps of the same names and are approximate.

| Map | Board | Deployment zones |
|---|---|---|
| Hammer and Anvil | 60″×44″ | 18″ strips along the short edges |
| Dawn of War | 44″×60″ | 12″ strips along the long edges |
| Search and Destroy | 60″×44″ | opposite quarters, minus 9″ around the centre |
| Sweeping Engagement | 44″×60″ | stepped strips along the long edges: 8″, then 14″ |
| Crucible of Battle | 60″×44″ | triangles in opposite corners |
| Tipping Point | 60″×44″ | stepped strips along the short edges: 12″, then 20″ |

The engine looks «forward» along the x axis (west against east), so every map is drawn with the players facing west–east: maps with zones on the long edges use a board 44″ wide. Everything is point-symmetric about the centre.

**Five objectives** on every map, each with a role for missions (`Objective.role`):

- **home** («home»): one per player, inside its zone (`Objective.home`);
- **central** («center»): the middle;
- **expansion** («flank»): two on the flanks, in No Man's Land.

Each player's half of the board is its territory (`GameState.territory`). The zones of the battle are kept in the state (`GameState.deployment`), and `deploymentZone` reads them first.

## Terrain layouts

Three layouts, drawn on the 60″×44″ board and transposed for the 44″×60″ maps, each point-symmetric:

- **A — «Manufactorum ruins»**: ruins, woods and a container around a ruined centre.
- **B — «Wooded hills»**: woods and craters, a wooded centre.
- **C — «City ruins»**: dense ruins.

No objective sits in a container or a barricade. The terrain editor's saved layout is not used on this board, because the board changes with the map.

## Layouts of the 44″×30″ board (Combat Patrol)

«Combat Patrol» also gets a layout picker:

- **A — «Classic (as before)»**: the original layout, still the default. The terrain editor's saved layout applies only with A.
- **B — «Forest edge»** and **C — «Street ruins»**: new, point-symmetric (`patrolLayout`).
- **Random.**

The new pieces stay between x 11″ and 33″, so the training rosters keep their fixed spots in the zones.

## Armies

Own lists from the army builder. A side without a list plays its 1000-point preset. Both armies start in the deployment preset that suits them, as on «Combat Patrol».

## Reserves

Up to half of the army may wait in Strategic Reserves and arrive from round 2 (see [reserves.md](reserves.md)).

## Scoring

A primary mission of the 11th edition, both sides playing the same one (see [missions.md](missions.md)). The «Training score» option keeps the training rule, 5 VP per objective.

## Tests

`strikeForce.test.ts`:

- zones inside the board and equal on both sides;
- five objectives, with the homes in their zones;
- no objective in a container or a barricade;
- every army at 1000 points fits legally on every map and layout (54 builds).

AI against AI: full games on «Crucible of Battle» and «Search and Destroy», 1–2 minutes each in Node.
