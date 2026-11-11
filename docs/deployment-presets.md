# Deployment presets

The deployment panel has four quick setups. One click places the whole army; after that any unit can still be moved by hand. The AI uses the same presets for its own army.

| Preset | What it does |
|---|---|
| ⚔ Штурм (Assault) | Assault units and screens on the front line, facing the nearest objectives; shooters cover them from behind. |
| 🎯 Огневой рубеж (Gun line) | Shooters spread across the whole zone with lines of fire; assault units wait in cover to counter-charge. |
| 🚩 Контроль поля (Control) | One unit per objective (most Objective Control first), fast units on the flanks, shooters in the centre. |
| 🛡 Оборона (Defence) | Everything behind terrain and out of the enemy's lines of fire. Useful when the enemy shoots first. |

## Why the presets work with any army

A preset does not store positions. It stores rules for each unit **role**, and the role is read from the datasheet (`src/game/army/roles.ts`):

- **штурм (assault):** melee output well above ranged, or short guns on a fast unit;
- **стрелки (shooter):** ranged output above melee;
- **заслон (screen):** ten or more cheap models that deal little damage (Gretchin);
- **персонаж (character):** the CHARACTER keyword; set up next to the unit the doctrine wants it to lead;
- **диверсанты (infiltrator):** the Infiltrators ability; set up outside the zone, more than 8″ from the enemy.

Each preset gives every role a depth in the zone (front or back), a lane along it (focus, spread, objective, flank, centre), and how much the unit wants open lines of fire or cover. The solver (`src/game/army/deployPresets.ts`) tries every point of the zone on a 1″ grid, then 0.5″, and gives each unit the best legal spot for its role. Legality is checked by the same `deploymentProblem` the manual setup uses.

When an army is too dense for the doctrine (1000-point hordes), the solver retries with smaller gaps between units, then with tight packing. Only if all three attempts fail does it keep the default positions and say so.

## Cards

Each card shows the result for the current army on the current board, against the enemy already set up:

- a mini map with the models coloured by role;
- how well the preset suits the army: the share of the army's wounds in the roles the doctrine is built for, or, for Defence, the share of shooters in the enemy army;
- which units end up in front.

The best-fitting preset is marked «реком.».

## Where it is applied

In open battles (scenarios with custom armies, `combat-patrol`), both armies start in their recommended preset. The AI sets up first and only knows the player's deployment zone. The player's preset then takes the AI's positions into account. Training scenarios keep their hand-made positions.
