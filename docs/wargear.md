# Wargear options

In the army builder, a unit with wargear options gets a «⚙» button. It opens an editor with these parts:

- **Leader (or a single-model character):** its weapons, chosen from a list.
- **Options:** for each group, how many models take each option, with a −/+ counter. The datasheet limit is in the group's title.
- **Weapon hints:** the weapons of every variant, with its first hint, for example “🔨 Pierces vehicles and monsters”.
- **The rest:** “The other N” shows how many models keep the default equipment.
- **Errors:** anything that breaks a limit is listed in red, and the list cannot be played until it is fixed.
- **Reset:** “As in the datasheet by default” goes back to the default.

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
| Serberys Sulphurhounds | one model in three: phosphor blast carbine and phosphor pistol instead of two phosphor pistols |
| Ironstrider Ballistarii | any number: twin cognis lascannon instead of twin cognis autocannon |
| Onager Dunecrawler | eradication beamer, Daedalus missile launcher and Icarus array, neutron laser and heavy stubber, or twin heavy phosphor blaster; and, as slots ([vehicles.md](vehicles.md)), an additional cognis heavy stubber and a broad spectrum data-tether |

Corpuscarii Electro-Priests and the Skorpius Dunerider have no wargear options on their datasheets.

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

**Single-model vehicles** (Rhino, Predator Annihilator, Trukk, Battlewagon, Wave Serpent, Fire Prism, Tyrannofex, and the Onager's extras) have optional wargear **slots**: a drop-down list per slot. See [vehicles.md](vehicles.md).

## Simplifications and a note for the data

- The Alpha always carries the Alpha combat weapon (an optional extra on the datasheet).
- The enhanced data-tether is not offered: its effect is not in the game.
- The Sicarian Princeps keeps the default weapons: the datasheet does not say whether it may swap.
- **The default Skitarii Rangers break the 11th edition limit.** They have both an arc rifle and a plasma caliver, but the datasheet allows one special weapon per unit. The editor shows this as soon as it is opened. The default composition itself (`COMPOSITION.rangers` in `army/armyList.ts`) is left as it is: changing it would change every existing game and the golden test, so it is worth a separate decision.

## The other armies

| Army | Units with options |
|---|---|
| Space Marines | Captain (6 loadouts, including a relic shield with +1 W), Lieutenant (5, including a storm shield with a 4+ invulnerable save), Intercessors (Sergeant's melee weapon, one grenade launcher per 5 models), Assault Intercessors (Sergeant, 6), Hellblasters and Bladeguard (Sergeant's pistol), Redemptor (6 weapon sets, including the Heavy Onslaught Gatling Cannon and the Icarus Rocket Pod) |
| Orks | Warboss (6), Boyz (Nob, 5 loadouts; per 10 models one big shoota, one rokkit launcha and one burna), Nobz (per 5 models: big skorcha, kustom big shoota, big choppa; any number: kombi-rokkit), Kommandos (Nob, and up to 1 burna, 1 rokkit, 1 breacha ram, 2 kustom shootas), Deff Dread (6 weapon sets) |
| Tyranids | Hive Tyrant (6), Tyranid Warriors (any number: deathspitter or spinefists; per 3 models a venom cannon and a barbed strangler), Termagants (any number: devourer or spinefists; per 10 models a shardlauncher, a spike rifle and a strangleweb), Carnifexes (5 loadouts, any number) |
| Necrons | Overlord (staff of light, voidscythe), Necron Warriors (gauss reaper), Immortals (tesla carbine), Lychguard (hyperphase sword and dispersion shield, 4+ invulnerable save), Canoptek Wraiths (particle caster, transdimensional beamer, whip coils) |
| Aeldari | Farseer (singing spear), Autarch (6), Guardian Defenders (exactly one Heavy Weapon Platform: shuriken cannon, missile launcher, bright lance, scatter laser or starcannon), Dire Avengers and Swooping Hawks (Exarch, 5 and 4), Wraithguard (D-scythe), Windriders (scatter laser, shuriken cannon) |

New data lives in `data/wargearExtra.ts`:

- **New weapons:** 58 of them, among them the hand flamer, thunder hammer, neo-volkite pistol, power klaw, kombi-weapons with both profiles, burna, kustom mega-blasta, spinefists, tesla carbine, D-scythe and reaper launcher.
- **Model variants:** 93, each built from an existing profile with other weapons, and for shields another invulnerable save or Wounds.
- **Tokens:** a variant without its own token and art borrows those of its base model.
- **Options:** described in `army/wargearOthers.ts`.

Simplifications:

- **Single-model units with many combinations:** where one model combines two weapon slots in many ways (Captain, Warboss, Deff Dread, Redemptor, Autarch, Carnifex, Hive Tyrant), the builder offers the common combinations, not every one.
- **Not modelled:**
  - Melta (no such keyword in the engine);
  - the Heavy Onslaught Gatling Cannon's Devastating Wounds against infantry only;
  - Paired Krumpas (+5 points);
  - the Plasmacyte;
  - the resurrection orb;
  - the second Nob of a 20-Boy unit;
  - the Exarchs' Aspect Shrine tokens.
- **Shared allowances:** where Wahapedia lists per-N options as separate bullets (Boyz, Termagants, Tyranid Warriors), each has its own allowance.

All default compositions are within the limits, except the Rangers (see above). `wargear.test.ts` also plays three AI-against-AI battles in which every unit takes an unusual loadout, and checks that every command stays legal.

## Next

Detachment Enhancements (points, for characters).
