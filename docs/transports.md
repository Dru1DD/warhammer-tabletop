# Transports

The transport rules of the 11th edition Core Rules (section 18, read on Wahapedia, 12.11.2026), with one transport so far: the **Skorpius Dunerider** (Adeptus Mechanicus). Discussed in Dru1DD/warhammer-tabletop#48.

Code: `src/game/rules/transports.ts`. Engine hooks in `src/game/engine.ts`: the `embark` and `disembark` commands, emergency disembarks after a command, empty Dedicated Transports at the start of the battle, Firing Deck in `shootPlan`.

## Capacity
A datasheet with `transport` carries `capacity` models of units that have every keyword in `keywords` and none in `exclude` (`TransportSpec`). The Dunerider carries 12 Adeptus Mechanicus INFANTRY models, not JUMP PACK, KATAPHRON or SYDONIAN SKATROS ones. Several units can ride together while there is room.

## Before the battle
The deployment panel has a «🚚 Transports» block:

- the selected unit can start the battle inside a transport;
- a unit inside can be taken out again (it then has to be set up).

**Empty transports.** A DEDICATED TRANSPORT with nobody inside is removed when the battle starts (it does not count as destroyed). The panel warns about it first, and “Start the battle ▶” asks “Start the battle with an empty transport?” (`emptyDedicated`): “Back to deployment” selects the transport, “Start without it” starts the battle. Not asked in the «minimal» explanation mode.

**The AI** fills each of its Dedicated Transports with the first unit that fits (`aiEmbark`).

## Embarking
In its Movement phase, after a Normal move, an Advance or a Fall Back, a unit can embark (`🚚 Embark in …` in its actions) if:

- every model is within 3″ of the transport;
- it was not set up on the battlefield this turn (out of reserves or a transport);
- there is room.

The unit is removed from the board.

## Disembarking
In its own Movement phase, unless it embarked in this phase or its transport Advanced or Fell Back. Every model is set up wholly within 3″ of the transport, not within Engagement Range of an enemy.

- **Tactical**: the transport has not moved yet. The unit then makes its move as usual.
- **Rapid**: the transport has already moved. The unit counts as having moved and cannot charge this turn.

**Choosing the spot.** The player clicks the side of the transport (`📍 Choose the side on the board`), or lets the game pick the side towards the objective. The game sets the models up on rings around the hull, nearest the chosen point first (`disembarkSpot`).

## A destroyed transport
After any command, every destroyed transport with passengers triggers an **Emergency Disembark**:

- each unit is set up wholly within 6″, as close to the hull as possible;
- it is unengaged if it can be, otherwise engaged;
- models that do not fit are destroyed;
- one hazard roll per model;
- then the unit is battle-shocked and cannot charge this turn.

A transport destroyed in the Strategic Reserves takes its passengers with it.

## Firing Deck
When a transport with Firing Deck X shoots, up to X embarked models each add one ranged weapon (not One Shot) to its volley, measured from the transport. The Dunerider has Firing Deck 2.

## Off the battlefield
Embarked units live in `GameState.embarked`, like the Strategic Reserves units in `GameState.reserves`. Nothing else in the engine sees them:

- they cannot be targeted;
- they do not control objectives;
- they are not counted by the missions.

A side whose remaining units are all inside transports or in reserve is not wiped out. Units inside a transport that is in reserve count toward the reserve points limit.

## In the game
- **On the board**, the transport shows «🚚N»: the models inside.
- **The action panel** has a «🚚 In transports» card:
  - who is inside which transport;
  - whether a disembark now is Tactical or Rapid;
  - the buttons to get out.

## Simplifications
- **The hull.** The Dunerider is a FRAME model without a base, drawn as a round 105 mm base.
- **Combat disembark** (6″, a hazard roll per model, when the transport Advanced or Fell Back) is not offered: disembarking is not possible then.
- **Fire Support** (re-rolling wound rolls after disembarking) is not implemented. The ability text says so.
- **Battle-shock tests** of units inside a transport are not taken while they are embarked.
- **After an Ingress move**, a Rapid disembark uses the normal 3″ rule; the Ingress restrictions are not re-checked.
- **Deadly Demise.** The transport's Deadly Demise is rolled with its other destruction effects, so possibly before the emergency disembark.
- **The AI** does not embark during the battle; it only gets its passengers out in its first Movement phase.

## Tests
`src/game/__tests__/transports.test.ts`:

- capacity and keywords;
- embarking;
- Tactical and Rapid disembarks;
- the 3″ rule and the Advance ban;
- the emergency disembark;
- an army inside a transport is not wiped out;
- the empty Dedicated Transport;
- Firing Deck;
- the AI filling its transport;
- a whole AI battle with a transport.
