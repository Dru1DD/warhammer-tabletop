# Wargear options (pilot: Adeptus Mechanicus)

In the army builder, a unit with wargear options gets a «⚙» button. It opens an editor with these parts:

- **Leader (or a single-model character):** its weapons, chosen from a list.
- **Options:** for each group, how many models take each option, with a −/+ counter. The datasheet limit is in the group's title.
- **Weapon hints:** the weapons of every variant, with its first hint, for example «🔨 Пробивает технику и монстров».
- **The rest:** «Остальные N» shows how many models keep the default equipment.
- **Errors:** anything that breaks a limit is listed in red, and the list cannot be played until it is fixed.
- **Reset:** «Как в датащите по умолчанию» goes back to the default.

A unit edited this way is marked ⚙ in the list. The loadout is saved with the army list, and the units are built with it.

## Mechanicus options (11th edition datasheets, Wahapedia)

| Unit | Options |
|---|---|
| Tech-Priest Dominus | macrostubber or phosphor serpenta; volkite blaster or eradication ray |
| Tech-Priest Manipulus | magnarail lance or transonic cannon |
| Skitarii Rangers | Alpha: galvanic rifle or Mechanicus pistol; 1 model: arc rifle, plasma caliver or transuranic arquebus; 1 model: omnispex |
| Skitarii Vanguard | Alpha: Mechanicus pistol or radium carbine; up to 1 each of arc rifle, plasma caliver and transuranic arquebus; 1 model: omnispex |
| Kataphron Breachers | any number: torsion cannon instead of heavy arc rifle; hydraulic claw instead of arc claw |
| Kataphron Destroyers | any number: plasma culverin instead of heavy grav-cannon; cognis flamer instead of phosphor blaster |
| Sicarian Infiltrators | any number of troopers: flechette blaster and taser goad instead of stubcarbine and power weapon |
| Kastelan Robots | any number: heavy phosphor blaster instead of combustor; phosphor blaster and fist, or twin phosphor blaster and close combat weapon, instead of twin fist |

New data:

- **Weapon:** the transuranic arquebus (36″, A1, BS4+, S7, AP−2, D3 damage, Heavy, Precision).
- **Model profiles:** 16 new ones for the combinations that did not exist yet, with tokens.

Points do not depend on wargear in 11th edition.

## How it works

A loadout (`ListEntry.loadout`) is the leader's profile and a count per variant profile; every other model is the default trooper. Each variant is simply a model profile with its own weapons. So the engine, the AI, the shooting hints and the deployment presets need no change.

The parts:

- `army/wargear.ts`: types, composition and limit checks;
- `army/wargearMechanicus.ts`: the Mechanicus options;
- `ui/LoadoutEditor.tsx`: the editor.

A unit without a loadout keeps its old default composition, so presets, scenarios and the golden test are unchanged.

## Simplifications and a note for the data

- The Alpha always carries the Alpha combat weapon (an optional extra on the datasheet).
- The enhanced data-tether is not offered: its effect is not in the game.
- The Sicarian Princeps keeps the default weapons: the datasheet does not say whether it may swap.
- **The default Skitarii Rangers break the 11th edition limit.** They have both an arc rifle and a plasma caliver, but the datasheet allows one special weapon per unit. The editor shows this as soon as it is opened. The default composition itself (`COMPOSITION.rangers` in `army/armyList.ts`) is left as it is: changing it would change every existing game and the golden test, so it is worth a separate decision.

## Next

The same for the other five armies, then detachment Enhancements (points, for characters).
