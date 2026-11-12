# Stratagems (stage 1: your own turn)

Command points (CP) used to pile up with nothing to spend them on. Now every army can spend them on four core Stratagems of the 11th edition, the ones a player uses in their own turn.

| Stratagem | CP | When | What it does |
|---|---|---|---|
| 🎲 Командный переброс (Command Re-roll) | 1 | any | Re-roll the Advance roll, or the charge roll (both dice) just made by the unit, even a failed one. In the middle of an attack: one hit, wound, damage, number-of-attacks or saving-throw die (see below). |
| 🦁 Безумная храбрость (Insane Bravery) | 1 | Command | Before the unit's battle-shock test: the test is passed without a roll. Once per battle. |
| 💣 Взрывчатка (Explosives) | 1 | Shooting | A unit with EXPLOSIVES (or GRENADES) throws 6D6 at a visible, unengaged enemy within 8″ instead of shooting: each 4+ is a mortal wound. |
| 🐘 Сокрушительный удар (Crushing Impact) | 1 | Charge | A MONSTER or VEHICLE that has charged rolls D6 equal to its Toughness: each 5+ is a mortal wound to an engaged enemy unit, each 1 a mortal wound to itself (at most 6 each). |

General rules:

- each Stratagem can be used once per phase;
- a unit can be the target of one Stratagem per phase;
- a battle-shocked unit cannot be targeted (core rules 01.07);
- Insane Bravery once per battle.

## Where to find them

- **The «📜 Стратагемы» card** in the right panel shows your CP and every Stratagem usable right now. Each Stratagem has one «Применить» button per unit it can be used on (and per target), so no unit has to be selected first; the selected unit's Stratagems come first. Below is a list of what each one does and when it pays off.
  - The buttons come from `stratagemActions` in the engine, the same list the unit's own action panel shows.
  - Extinction Order is offered only for objectives with an enemy unit on them; on an empty one it would do nothing.
- **The board's action bar** offers «🎲 Перебросить атаку (1 CP)» right after a charge roll, because that window closes with the next command.
- **A CP reminder.** With 3 CP or more (`CP_HOARD`), a Stratagem usable now and none used this phase:
  - the card shows «💡 Накопилось N CP»;
  - ending the phase asks once, naming the usable Stratagems, the same way as the Imperative reminder.

  It comes from `cpReminder` in `src/ui/guidance.ts`. Unspent CP piled up to 5–10 by the end of the player's games.

## The AI

The AI uses them too:

- **Insane Bravery** before the test, for a unit on an objective with a 25% or higher chance to fail, or for a big unit from round 3 with 50% or more;
- **Explosives** when 6D6 at 4+ beats the unit's own shooting by a wound or more;
- **Crushing Impact** whenever it can;
- **Command Re-roll** for a failed charge that still has a 30% chance or more.

`aiEquivalence.test.ts` was re-recorded for the Marines against Orks game for this reason. Those two armies now have units with EXPLOSIVES.

## Differences from the tabletop

- **Command Re-roll mid-attack** is offered only when it is worth it (see below), not for every die.
- Counteroffensive and Rapid Ingress are not implemented yet.

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
| Space Marines | Gladius Task Force | Storm of Devastation; reactions: Armour of Contempt, A Worthy Death | Responsive Tactics (a move in the opponent's turn); Might of Angels (needs Lance); Adaptive Strategy (needs combat doctrines) |
| Orks | War Horde | Close-Range Dakka, Fungus-Fuel Injection, Hit 'Em Harder; reaction: Orks Is Never Beaten | Breakin' Heads; Mow 'Em Down (no non-WALKER vehicles here) |
| Tyranids | Invasion Fleet | Adrenal Surge (one unit at a time); reactions: Rapid Regeneration, Death Frenzy | Overrun, Predatory Imperative, Endless Swarm |
| Necrons | Awakened Dynasty | Sudden Storm, Conquering Tyrant, Hungry Void; reaction: Undying Legions | Eternal Revenant, Vengeful Stars |
| Aeldari | Warhost | Blitzing Firepower, Feigned Retreat; reaction: Lightning-Fast Reactions | Skyborne Sanctuary, Fire and Fade, Webway Tunnel |
| Adeptus Mechanicus | Rad-Zone Corps | Lethal Dosage, Aggressor Imperative, Extinction Order; reactions: Baleful Halo, Bulwark Imperative | Pre-Calibrated Purge Solution |

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

# Reactions (stage 2: the opponent's turn)

Some core Stratagems are used in the opponent's turn. The engine gives the other player a **reaction window** at two moments:

| Window | When | Reactions |
|---|---|---|
| `beforeShooting` | the active player ends the Movement phase | Fire Overwatch, Smokescreen |
| `afterCharges` | the active player ends the Charge phase | Heroic Intervention |

While a window is open, `GameState.reaction` is `{ player, window, next }` and `actor()` returns the reacting player. That player may only use a reaction from this window or send `{ type: 'passReaction' }`. The window then enters the `next` phase. It also closes by itself once no usable reaction is left. A window opens only when the reacting player has a reaction they can use: the CP, a unit in range, and the right keyword.

- **Fire Overwatch** (1 CP): a unit not in combat shoots an enemy within 24″. It is Snap Shooting: hits only on an unmodified 6, with no hit re-rolls or critical-hit changes. This holds for Psychic weapons too, although they otherwise ignore hit penalties (`AttackContext.snap`).
- **Smokescreen** (1 CP, SMOKE): the unit has cover for the rest of the turn.
- **Heroic Intervention** (1 CP): a unit not in combat, within 12″ of an enemy that charged this phase, rolls 2D6 and moves into engagement with it. It does not count as having charged, so it gets no Fights First. A VEHICLE can do this only if it is a CHARACTER or WALKER.
- **Epic Challenge** (1 CP, CHARACTER) is not a window reaction. It works in either player's Fight phase, just before the character fights: its melee attacks gain Precision for the phase.

## «Only when useful»

`reactionAdvice(s)` (`src/game/reactionAdvice.ts`) scores every legal reaction by expected value. The AI and the player's pause dialog share it.

- Overwatch is worth it at 1 or more expected wounds.
- Smokescreen is worth it when the strongest enemy volley at the unit is 3 or more wounds.
- Heroic Intervention is worth it at a 50% or better chance to arrive, at least 1.5 expected wounds dealt, and not much more taken than dealt.

The standard AI uses the best worthwhile reaction and passes otherwise; the beginner AI always passes.

For the player, `ReactionPrompt` pauses the game only when some reaction is worthwhile. It lists the useful ones with the reason, and the rest under a fold. When none is useful, it passes on its own.

# Command Re-roll mid-attack and Insane Bravery before the test (stage 2, part 2)

## Command Re-roll in the middle of an attack

`resolveGroup` takes an optional `RerollHook`. Right after one of these dice it asks the hook, and on `true` re-rolls that die:

| Die | Who re-rolls | Expected gain used to price it |
|---|---|---|
| number of attacks (D3/D6) | attacker | (average − rolled) × expected damage of one attack |
| missed hit | attacker | chance to hit × expected damage of one hit |
| failed wound | attacker | chance to wound × expected damage of one wound |
| failed save | target's player | chance to save × damage (capped by the model's wounds) |
| random damage (D3/D6) | attacker | expected damage of a new die − damage of this one (capped by wounds) |

The hook is not asked for a die already re-rolled by an ability (Twin-linked, re-roll 1s), or for Snap Shooting.

The engine (`runAttack`) resolves `shoot` and `fight` on a copy of the state. Suppose a die gains `REROLL_WORTH` (1.5) expected damage or more, and its player can still use a Command Re-roll on the unit: enough CP, no Command Re-roll this phase, no Stratagem on that unit this phase, and the unit not battle-shocked. Then the attack stops.

- Nothing is applied while it is stopped. `GameState.pendingReroll` keeps the dice rolled so far (the die in question last), the earlier answers, and who decides.
- `actor()` returns that player. Only `{ type: 'rerollChoice', reroll }` is accepted.
- The answer replays the attack with the same dice and goes on. The dice after the stopped one were never shown, because they are rolled only now.
- A re-roll costs 1 CP and is logged as the Stratagem.

The standard AI always re-rolls when asked (it is asked only when it is worth it). The beginner AI keeps the die. For the player, `RerollPrompt` shows the die, its value and the expected gain, with «Перебросить (1 CP)» and «Оставить». In AI games this stops 0–4 times a battle.

## Insane Bravery before the test

At the start of the Command phase the engine lists the units that must take a Battle-shock test (`shockPending`). If the player can use Insane Bravery on one of them, a `beforeShockTests` window opens for the active player. Using the Stratagem passes that unit's test without a roll. Passing rolls the remaining tests, then objectives and VP are scored as before. The prompt and the AI use `reactionAdvice`: worth it for a unit on an objective with a 25% or higher chance to fail (`shockFailChance`).

# Faction reactions (stage 2, part 3)

Each army's detachment has Stratagems used when an enemy attacks one of its units. They use two more reaction windows:

| Window | When | Who answers |
|---|---|---|
| `onTargeted` | an enemy unit has selected the unit as the target of a `shoot` or `fight` command, before any dice | the target's player |
| `afterAttacks` | the enemy's attacks destroyed models of the unit and it is still on the battlefield | the target's player |

`GameState.reaction` carries `unitId` (the unit the window is about). For `onTargeted` it also carries `attack`, the waiting command. The attack is resolved when the window closes, on a pass or after the Stratagem, and may still stop for a Command Re-roll. The windows open only when the player has the CP and a reaction that fits the unit. A unit gets one Stratagem per phase, so a second attack on it in the same phase opens no window.

| Army | Stratagem | CP | Window, phase | Effect here |
|---|---|---|---|---|
| Space Marines | Armour of Contempt | 1 | `onTargeted`, opponent's Shooting or any Fight phase | AP of that enemy unit's attacks worse by 1 (never above 0), until it has attacked |
| Space Marines | A Worthy Death | 1 | `onTargeted`, Fight | the fallen strike back (below) |
| Orks | Orks Is Never Beaten | 1 | `onTargeted`, Fight, not TITANIC | the fallen strike back, on 3+ when riled up by the Waaagh! |
| Tyranids | Rapid Regeneration | 1 | `onTargeted`, opponent's Shooting or any Fight phase | Feel No Pain 6+ (5+ within Synapse Range) to the end of the phase |
| Tyranids | Death Frenzy | 1 | `onTargeted`, Fight | the fallen strike back |
| Aeldari | Lightning-Fast Reactions | 1 | `onTargeted`, opponent's Shooting or any Fight phase, not WRAITH CONSTRUCT | −1 to hit the unit to the end of the phase |
| Adeptus Mechanicus | Bulwark Imperative | 2 | `onTargeted`, opponent's Shooting, SKITARII | 4+ invulnerable save to the end of the phase |
| Adeptus Mechanicus | Baleful Halo | 2 | `onTargeted`, Fight, not VEHICLE | −1 to wound the unit to the end of the phase (a wound roll is never modified by more than −1) |
| Necrons | Protocol of the Undying Legions | 1 | `afterAttacks`, opponent's Shooting or any Fight phase | Reanimation Protocols at once: heal D3 (D3+1 when a CHARACTER leads the unit), bringing models back |

**The fallen strike back.** A Worthy Death, Orks Is Never Beaten and Death Frenzy work the same way here. The unit must not have fought this phase. Each of its models destroyed by that attack rolls a D6, and on 4+ it fights the attacker before it is removed. On the tabletop, Death Frenzy models fight right after the enemy's attacks. The Space Marine and Ork models stay and fight together with their unit later in the phase. Here all three strike right after the enemy's attacks, against that enemy unit, so the game needs no "destroyed but still standing" models.

## «Only when useful»

`reactionAdvice` prices them with the same expected-damage maths as the AI:

- a defensive effect: the expected damage of the waiting attack without and with the effect, compared on a copy of the state;
- the fallen striking back: expected models lost × 1/2 (2/3 for riled-up Orks) × each model's melee damage against the attacker;
- Undying Legions: the wounds and models it would bring back.

Each is worth it at 1.5 or more per CP. For example, Armour of Contempt pays off against a Hive Tyrant, Skorpekh Destroyers or a mob of Boyz (AP −1) hitting Intercessors. It does not against a single Deff Dread hitting a Redemptor (2+ save, ≈ 0.8 wounds saved). The standard AI uses the best reaction worth it; the beginner AI passes. The player's prompt opens only when one is worth it, and the button shows the cost (2 CP for the Adeptus Mechanicus ones).

Simplifications:

- Bulwark Imperative and Baleful Halo do not extend to a second SKITARII unit within 6″ of a BATTLELINE one.
- Protocol of the Vengeful Stars, Protocol of the Eternal Revenant, Responsive Tactics and Webway Tunnel are still listed as «later».

# Online: a timeout for reactions and re-roll questions (stage 2, part 4)

In an online game a reaction window or a Command Re-roll question waits for the player who decides it, but not forever. The host times every open question (`DECISION_TIMEOUT`, 20 s, in `src/multiplayer/host.ts`). If the match is still at that version when the time is up, the host submits the skip for that player: `passReaction`, or `rerollChoice` with `reroll: false`.

- The skip goes through the normal pipeline with the deciding player's id, so the guest receives it as an ordinary accepted action.
- It applies to both players, the host's own questions included. An answer in time, or any other accepted action, cancels the timer.
- A new question gets a new timer.

Both sides see the time:

- the prompts (`ReactionPrompt`, `RerollPrompt`) show «⏱ N с»;
- the waiting side's hint says «Ждём не больше 20 с, потом — пропуск».

Each side counts locally (`useCountdown`); only the host's timer acts. Games against the AI have no limit.
