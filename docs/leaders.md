# Leaders and Support characters in units

A Leader or Support character joins a unit before the battle, and the two fight as one unit (#64). This follows the 11th edition core rules, checked on Wahapedia on 14.11.2026:
- 19 Attached Units;
- 24.22 Leader and 24.34 Support;
- 25.04 Muster Armies;
- 05.03 wound allocation;
- 24.28 Precision.

Code:
- `src/game/rules/attached.ts`: who can lead whom, and joining a character to a unit;
- `src/game/gameState.ts`: how the rules read an attached unit (`liveDatasheets`, `hasAbility`, `hasAbilityAll`, `modelHasAbility`, `leadingAbility`, `ledBy`, `isLed`, `attackToughness`, `unitKeywords`);
- `src/game/army/armyList.ts`: `ListEntry.attachTo`, `attachments`, the list checks;
- `src/game/army/placement.ts`: `listUnits` builds the attached units;
- `src/ui/ArmyBuilder.tsx`: the choice in the army builder;
- `src/ui/Panels.tsx`: the unit card.

Tests: `src/game/__tests__/attached.test.ts`.

## Who can lead whom

The lists come from the datasheets. Only the units the game has are listed.

| Army | Character | Kind | Can join |
|---|---|---|---|
| Adeptus Mechanicus | Tech-Priest Dominus, Tech-Priest Manipulus | Leader | Skitarii Rangers, Skitarii Vanguard, Kataphron Breachers, Kataphron Destroyers, Corpuscarii Electro-Priests |
| Space Marines | Captain | Leader | Intercessors, Assault Intercessors, Hellblasters, Infernus, Bladeguard Veterans |
| Space Marines | Lieutenant | Support | the same |
| Orks | Warboss | Leader | Boyz, Nobz |
| Necrons | Overlord | Leader | Necron Warriors, Immortals, Lychguard |
| Necrons | Royal Warden | Leader | Necron Warriors, Immortals |
| Tyranids | Winged Tyranid Prime | Leader | Tyranid Warriors |
| Aeldari | Autarch | Leader | Dire Avengers, Guardian Defenders |
| Aeldari | Farseer | Leader | Guardian Defenders |

The Hive Tyrant can only lead Tyrant Guard, which the game does not have, so it is always on its own. The data is `Datasheet.leads` and `Datasheet.support`.

## The army list

- A unit takes one Leader and one Support.
- A Support character must join a unit. The list shows an error when it cannot.
- Each character's row in the army builder has a list: the units it can join, and "nobody" (not for Support). The choice is `ListEntry.attachTo`:
  - an index into the list;
  - `null`: the character stays on its own;
  - absent: the game picks.
- **The game's pick** (`attachments`): a unit of the character's list with no character of its kind yet. It prefers a unit with no character at all, then the biggest, then the first. The preset armies and the AI use the same pick.
- The army code keeps the choice. A list that was saved before this change has no choices, so the game picks.

## One unit

`listUnits` puts the character's models into the bodyguard unit. The unit keeps the bodyguard's datasheet and id, and `UnitState.attached` lists the characters and their models. Its name reads "Skitarii Rangers + Tech-Priest Dominus".

| Rule | In the game |
|---|---|
| Starting strength | Every model, the characters included (01.02.01). |
| Keywords and abilities | Those of every part that still has a living model (19.03, 19.04). When the Dominus dies, the unit loses CHARACTER and Data-spike. |
| "While this model is leading a unit" | `leadingAbility`: only for a character inside a unit. A character on its own leads nobody. It keeps the ability after its bodyguard is destroyed (19.04). |
| "This model" | Might Is Right, Finest Hour and Implacable Resilience work for the character's own model only (`modelHasAbility`). Its melee attacks form a group of their own. |
| Every model | Deep Strike, Infiltrators and Stealth work only when every part of the unit has them (`hasAbilityAll`, 24.09). A Winged Prime leading Tyranid Warriors cannot Deep Strike. |
| Toughness | The highest Toughness of the bodyguard models; that of the characters once no bodyguard is left (19.02). |
| Wounds | CHARACTER models take wounds after all the others, unless Precision picks them. This rule was already in the game. |
| Leadership | The test passes on the best Ld in the unit (08.03). |
| Destroyed | Only with the last model. The bodyguard dying is not a destroyed unit, and the character does not split off (19.01.01, 19.02). With the bodyguard gone, the unit is below half-strength. |
| Points | The bodyguard's cost plus each character's (`unitCost`). |

## What changed in the abilities

These abilities used to apply to the nearest suitable unit within 3″. They now need the character inside the unit:
- Lord of the Machine Cult: Feel No Pain 5+, or 4+ for Electro-Priests, as on the datasheet;
- Galvanic Field;
- Defend the Divine Work: the whole attached unit;
- Guardian Protocols;
- Alpha Warrior;
- Superlative Strategist;
- the Necron Command Protocols, Protocol of the Hungry Void, Conquering Tyrant and Undying Legions bonuses "while a CHARACTER leads the unit".

The "leader" zones are gone from the board, because the character is inside the unit.

## Simplifications

- **The Introductory duel** (the 30″×22″ tutorial board) keeps the Lieutenant on its own, because the tutorial moves it on its own. Everywhere else a Support character joins a unit.
- **Boss' Ammo Runt and the Boyz' Ammo Runts** share one use in an attached unit. On the table each has its own use.
- **Feel No Pain of the Electro-Priests** (their own 5+) applies to the whole unit, the Tech-Priest included.
- **Old saves** load as before: their characters stay units of their own and get no leading bonus.

## Not included

- Units the game does not have, such as Tyrant Guard.
- Enhancements.
- Rules that split a character off when its bodyguard is destroyed (19.01.01). No unit in the game has one.
