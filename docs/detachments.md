# Detachment rules

Each army plays the generic detachment of its 11th edition faction page on Wahapedia (see `docs/stratagems.md`). Besides its Stratagems, a detachment gives the whole army one rule. The texts are in `src/game/rules/detachments.ts` (`DETACHMENT_RULE`); the army screen shows each army's rule under «📜 Stratagems».

| Army | Detachment | Rule | Here |
|---|---|---|---|
| Space Marines | Gladius Task Force | Codex Discipline: one combat doctrine may be selected one more time per battle | with the Combat Doctrines army rule, new here (below) |
| Orks | War Horde | Get Stuck In: Orks' melee attacks have Sustained Hits 1 | `meleeSetup` |
| Tyranids | Invasion Fleet | Hyper-adaptations: one choice for the battle | all three (below) |
| Necrons | Awakened Dynasty | Command Protocols: +1 to hit while a NECRONS CHARACTER leads the unit | `detachmentAttack`, shooting and melee |
| Aeldari | Warhost | Martial Grace: +1 Battle Focus token every round, +1″ to Swift as the Wind | 3 tokens, Swift as the Wind +3″ |
| Adeptus Mechanicus | Rad-Zone Corps | Rad-bombardment | the Bombardment and the Fallout (below) |

## Space Marines: Combat Doctrines and Codex Discipline

**Combat Doctrines** (army rule). At the start of their Command phase the Marines may select one doctrine. It is active for every Marine unit until their next Command phase (`players.marines.doctrine`, command `{ type: 'doctrine' }`):

- **Assault**: an Advance does not prevent a charge.
- **Devastator**: ranged attacks have Assault, so every gun fires after an Advance.
- **Tactical**: a Fall Back does not prevent shooting or a charge.

Each doctrine can be selected once per battle. **Codex Discipline** lets one of them be selected one more time (`doctrineLeft`, `doctrinesUsed`).

For the player, the right panel shows «Combat Doctrines» with a button for each doctrine still available, and the header shows the active one. The standard AI picks one of them, if still available:

- Tactical when a unit is locked in combat;
- Assault when an assault unit is 8–14″ from an enemy;
- Devastator in rounds 1–2.

The beginner AI does not use doctrines.

## Tyranids: Hyper-adaptations

At the start of the battle (in `startGame`) the Tyranids must choose one Hyper-adaptation for the whole battle. Until they do, `actor()` returns the Tyranids (`hyperPending`) and only `{ type: 'hyperAdaptation' }` is accepted. The player gets a dialog with the AI's advice.

- **Swarming Instincts**: attacks on INFANTRY or SWARM units have Sustained Hits 1.
- **Hyper-aggression**: attacks on MONSTER or VEHICLE units have Lethal Hits.
- **Hive Predators**: Critical Hits on CHARACTER units have Precision. `AttackContext.critPrecision` gives Precision only to the wounds that come from Critical Hits: Lethal Hits first, then the wound dice of the Critical Hits.

The AI takes Hyper-aggression when monsters and vehicles hold 35% or more of the enemy's wounds, else Swarming Instincts.

The Predatory Imperative Stratagem, which switches the Hyper-adaptation of chosen units, is still listed as «later».

## Necrons: who leads a unit

The game has no leader attachment for the Necrons. As for Guardian Protocols (`docs/necrons.md`), a friendly NECRONS CHARACTER within 3″ of a non-CHARACTER Necrons unit counts as leading it (`necronLed` in `isLed`).

This also makes the existing «if a CHARACTER leads the unit» parts work for the Necrons; they never applied before:

- Protocol of the Conquering Tyrant;
- Protocol of the Hungry Void;
- the D3+1 of Protocol of the Undying Legions.

## Adeptus Mechanicus: Rad-bombardment

**Bombardment**, at the start of the first battle round (`startGame`). Each enemy unit with a model in the enemy's deployment zone either:

- takes cover: battle-shocked, and on 5+ D3 mortal wounds; or
- stands firm: on 3+ D3 mortal wounds.

On the tabletop the owner chooses. Here the game chooses for them: a unit that D3 mortal wounds could wipe out (3 wounds or fewer, `RAD_COVER_WOUNDS`) takes cover, the others stand firm. The dice log says which.

**Fallout**, at the start of the Mechanicus Command phase in rounds 2–5. Each enemy unit in its own deployment zone rolls a D6: on 3+ it takes 1 mortal wound and a Battle-shock test.

## Aeldari: what is left out

Martial Grace also adds 1 to the D6 of Agile Manoeuvres that roll one. The game has no such manoeuvre yet, only Swift as the Wind.

## A pure custom army (no detachment)

An own list (a preset or a custom list) has a checkbox in the army builder: the “Detachment rules” checkbox, on by default. Unchecked (`ArmyList.noDetachment`), the army plays without its detachment.

- No detachment rule: no Codex Discipline repeat, Get Stuck In, Hyper-adaptations, Command Protocols, Martial Grace or Rad-bombardment.
- No detachment Stratagems or detachment reactions: they are refused with the reason, and the army screen marks them ✗. The core Stratagems stay.
- The army rules stay: Combat Doctrines (each once), the Waaagh!, Synapse, Shadow in the Warp, Reanimation Protocols, Battle Focus with 2 tokens and Swift as the Wind +2″, the Doctrina Imperatives.

The flag travels with the list:

- in saved lists and the army code (`d: 0`);
- in online games (the lobby shows «…, no detachment»);
- into the battle as `players[side].noDetachment`, checked by `detachmentOn`.

The training roster always plays with its detachment.

## Tests

`src/game/__tests__/detachments.test.ts`:

- Get Stuck In;
- Command Protocols with and without a leader;
- Hyper-adaptations: the choice gate, the effect of each one, Precision on crits only, the AI's choice;
- doctrine limits and effects, and the end of a doctrine at the next Command phase;
- the Bombardment and taking cover;
- the Fallout.

The Battle Focus tests now expect 3 tokens. Golden master and AI equivalence are re-recorded.
