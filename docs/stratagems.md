# Stratagems (stage 1: your own turn)

Command points (CP) used to pile up with nothing to spend them on. Now every army can spend them on four core Stratagems of the 11th edition, the ones a player uses in their own turn.

| Stratagem | CP | When | What it does |
|---|---|---|---|
| 🎲 Командный переброс (Command Re-roll) | 1 | Movement, Charge | Re-roll the Advance roll, or the charge roll (both dice) just made by the unit, even a failed one. |
| 🦁 Безумная храбрость (Insane Bravery) | 1 | Command | The unit's battle-shock test counts as passed. Once per battle. |
| 💣 Взрывчатка (Explosives) | 1 | Shooting | A unit with EXPLOSIVES (or GRENADES) throws 6D6 at a visible, unengaged enemy within 8″ instead of shooting: each 4+ is a mortal wound. |
| 🐘 Сокрушительный удар (Crushing Impact) | 1 | Charge | A MONSTER or VEHICLE that has charged rolls D6 equal to its Toughness: each 5+ is a mortal wound to an engaged enemy unit, each 1 a mortal wound to itself (at most 6 each). |

General rules:

- each Stratagem can be used once per phase;
- a unit can be the target of one Stratagem per phase;
- a battle-shocked unit cannot be targeted (core rules 01.07);
- Insane Bravery once per battle.

## Where to find them

- **The «📜 Стратагемы» card** in the right panel shows your CP, buttons for every Stratagem usable right now (for any of your units), and a list of what each one does and when it pays off.
- **The board's action bar** offers «🎲 Перебросить атаку (1 CP)» right after a charge roll, because that window closes with the next command.

## The AI

The AI uses them too:

- **Insane Bravery** for a unit on or near an objective, or for a big unit from round 3;
- **Explosives** when 6D6 at 4+ beats the unit's own shooting by a wound or more;
- **Crushing Impact** whenever it can;
- **Command Re-roll** for a failed charge that still has a 30% chance or more.

`aiEquivalence.test.ts` was re-recorded for the Marines against Orks game for this reason. Those two armies now have units with EXPLOSIVES.

## Differences from the tabletop

- **Insane Bravery:** on the tabletop it is declared just before the roll. Here the engine rolls the battle-shock tests automatically when the Command phase starts, so the Stratagem is offered right after a failed test and turns it into a pass. The objectives that were scored at the start of the phase are scored again for the unit.
- **Command Re-roll:** covers only Advance and charge rolls. Re-rolling a hit, wound, save or damage roll needs a pause in the middle of an attack. That is stage 2, together with the Stratagems used in the opponent's turn: Fire Overwatch, Smokescreen, Heroic Intervention, Counteroffensive, Rapid Ingress and Epic Challenge.

## Data

The EXPLOSIVES keyword was added where the 11th edition datasheets have it (checked on Wahapedia) and it was missing here:

- Lieutenant;
- Intercessors;
- Assault Intercessors;
- Boyz.

The datasheets added earlier (Captain, Hellblasters, Infernus, Bladeguard, Warboss, Nobz, Kommandos) already had it. Aeldari units have the older GRENADES keyword, which also counts. Skitarii have neither.

The code is in `src/game/rules/stratagems.ts` (data and shared checks), `stratagemProblem` / `applyStratagem` in `engine.ts`, and the tests in `stratagems.test.ts`.

# Army Stratagems (detachments)

Each army plays the generic detachment of its 11th edition faction page on Wahapedia:

| Army | Detachment | Playable now (own turn) | Listed as «later» |
|---|---|---|---|
| Space Marines | Gladius Task Force | Storm of Devastation | Armour of Contempt, A Worthy Death, Responsive Tactics (opponent's turn); Might of Angels (needs Lance); Adaptive Strategy (needs combat doctrines) |
| Orks | War Horde | Close-Range Dakka, Fungus-Fuel Injection, Hit 'Em Harder | Orks Is Never Beaten (opponent's turn); Breakin' Heads; Mow 'Em Down (no non-WALKER vehicles here) |
| Tyranids | Invasion Fleet | Adrenal Surge (one unit at a time) | Rapid Regeneration, Death Frenzy (opponent's turn); Overrun, Predatory Imperative, Endless Swarm |
| Necrons | Awakened Dynasty | Sudden Storm, Conquering Tyrant, Hungry Void | Eternal Revenant, Undying Legions, Vengeful Stars |
| Aeldari | Warhost | Blitzing Firepower, Feigned Retreat | Lightning-Fast Reactions, Skyborne Sanctuary, Fire and Fade, Webway Tunnel |
| Adeptus Mechanicus | Rad-Zone Corps | Lethal Dosage, Aggressor Imperative, Extinction Order | Baleful Halo, Bulwark Imperative (opponent's turn); Pre-Calibrated Purge Solution |

The detachment rules themselves (Get Stuck In, Hyper-adaptations, Rad-bombardment, Command Protocols and so on) are not part of this change. They would change every battle and are worth a separate discussion.

## Which Stratagems an army can use

A Stratagem may require a unit with certain keywords (`requires` in `rules/stratagems.ts`). For example:

- Explosives needs EXPLOSIVES or GRENADES;
- Crushing Impact needs a MONSTER or VEHICLE;
- Fungus-Fuel Injection needs a VEHICLE or MOUNTED unit;
- Aggressor Imperative needs SKITARII;
- Extinction Order needs a TECH-PRIEST.

The same data is used in two places:

- **The army screen:** each army's card has a «📜 Стратагемы: N из M доступны» line. Missing ones are marked ✗ with the reason, for example «нет отряда: нужен отряд с EXPLOSIVES или GRENADES». The detachment's other Stratagems are marked ⏳ with why they are not playable yet. This works for the training roster, the presets and a custom list.
- **In battle:** the engine refuses a Stratagem on a unit that does not fit it, or on a unit from another army.

## Effects

Lasting effects are stored on the unit (`phaseBuffs` and `turnBuffs`), which expire at the end of the phase or turn. The attack and move rules read them:

- Ignores Cover;
- Rapid Fire +1;
- Sustained Hits within 12″;
- hit re-rolls within half range;
- Lethal Hits;
- +1 S / +1 AP;
- critical hits on 5+ (a new `critHitOn` in the attack context, also used by the AI's expected damage);
- +2″ Move;
- Assault after Advance;
- shooting and charging after Falling Back.

Fight-phase Stratagems (Hit 'Em Harder, Hungry Void) work in either player's turn, because choosing which unit fights is that player's own decision.

The AI spends army Stratagems on a volley or a fight worth it (2.5 or more expected wounds when shooting, 2 or more in melee), always keeping 1 CP in reserve. It also uses Extinction Order on an objective with enemies on it.
