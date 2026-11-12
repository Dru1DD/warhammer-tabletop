# Architecture: command pipeline and multiplayer readiness

Single-player behaviour is unchanged. This document describes the seams that a future
two-human (PeerJS / WebRTC) mode plugs into. The online mode is now implemented in `src/multiplayer` on top of these seams (see `docs/multiplayer.md`); `src/game` still contains no networking code.

## Layers

```
 producers (who WRITE commands)        pure core (src/game)                      consumers
 ─────────────────────────────         ─────────────────────────────────         ─────────────────
 UI click      ─ dispatch(cmd) ─┐
 AI  (decide)  ─ aiStep()      ─┼─▶ CommandEnvelope ─▶ match.submit() ─▶ MatchState ─▶ Zustand store ─▶ React
 future remote ─ adapter       ─┘        │                  │  engine.validate / engine.apply          autosave
                                         └ same rules for everyone ┘
```

| Layer | Files | Knows about |
|---|---|---|
| Rules engine | `src/game/engine.ts`, `rules/`, `combat/`, `dice/` | `GameState`, `Command`, `Roller`. Unchanged. |
| Match layer | `src/game/match/{types,match,transport}.ts` | engine, AI (only `aiProposal`). No React/Zustand/clock/random/network. |
| Persistence | `src/game/persistence.ts` | state + match block, format migrations |
| Store | `src/store.ts` | orchestration only: publishes `match.state` as `game`, keeps UI state, undo snapshots, autosave |
| UI | `src/ui/*` | reads `game`; calls `dispatch(cmd)` (unchanged API) |

`src/game/__tests__/match.test.ts` fails the build if anything under `src/game` imports React, Zustand,
Konva, `peerjs`/WebRTC libraries or `store`/`ui`, if the match layer touches `Date`/`Math.random`/`crypto`,
or if any networking dependency other than `peerjs` appears (only `src/multiplayer/peer.ts` may import it).

## AI off the main thread

The AI's `decide` is a pure function of the state, so where it runs does not change the answer.

- **Where it runs in the browser.** `useAiLoop` (`App.tsx`) calls `store.aiStepAsync()`. That computes the decision in a Web Worker: `src/game/ai/worker.ts`, called through `src/game/ai/aiClient.ts`. The page keeps responding while the AI thinks.
- **What is sent.** The state goes to the worker without `log` and `diceLog`: the AI never reads them, and they are the largest part of the state.
- **Stale answers.** If the game moved on while the AI was thinking (undo, quit, a new battle), the answer is dropped. Only one decision is in flight at a time.
- **The submit path is unchanged.** The decision goes through the same pipeline as before (`nextEnvelope` → `submit`), including the forced `endPhase` safeguard.
- **Fallbacks.** Without workers (tests, jsdom, old browsers), when the worker reports an error, or when it crashes, `decideAsync` computes on the main thread instead.
- **Synchronous path.** `store.aiStep()` stays synchronous. Tests and tools use it, and it makes exactly the same move.
- **Indicator.** The side panel shows “AI is thinking about its move…” while a decision is in flight (`store.aiThinking`).

## Sides, participants, controllers

- `PlayerId` (`'marines' | 'orks'`) is the **side** on the table: it owns the army (`UnitState.owner`)
  and the faction. It was not renamed (`SideId` is an alias).
- A **participant** is an opaque string id (`'local'`, `'ai-orks'`, a future peer id).
- `PlayerController = { type: 'local' | 'ai' | 'remote', playerId }`; `PlayerAssignments` maps each side to a controller.
  `soloAssignments(human)` builds today's setup: human side `local`, the other side `ai-<side>`.
- Authorization looks **only at `playerId`**, never at `type`. `type` just says where commands come from
  (UI, `aiProposal`, network).
- **Who may act** is `actor(state)` (engine), exposed as `decidingSide(match)`: normally the active player, but during
  the fight phase the side currently selecting a unit (the non-active side included). A command is authorized when
  the sender controls that side; the engine then checks the unit's owner as before.

## Command pipeline (`match.submit`)

`submit(match, envelope)` is pure: it returns a new `MatchState` plus an `ActionRecord`, or a rejection. A rejection
returns no match, so nothing (state, version, sequence counters, history) can change. Checks run in this order:

| # | Check | Reject code |
|---|---|---|
| 1 | envelope shape (it may come from the network) | `malformed` |
| 2 | `gameId` matches | `wrong-game` |
| 3 | `commandId` already accepted, or `sequence <= last accepted` of this sender | `duplicate` |
| 4 | `sequence != last + 1` | `bad-sequence` |
| 5 | `expectedStateVersion != match.version` | `stale-state` |
| 6 | sender controls `decidingSide` | `unauthorized` |
| 7 | `engine.validate` (reason passed through verbatim); exceptions from hostile payloads are caught | `illegal` |

Then `engine.apply(state, cmd, seededRoller(state.rng))`, exactly the call shape documented for replay in
`coach/types.ts`. The roller is wrapped only to record the raw d6 values; `state()` passes straight through, so RNG
consumption is unchanged (the golden-master test still passes untouched).

```ts
CommandEnvelope { gameId, playerId, sequence /* per sender, from 1 */, expectedStateVersion, commandId, command }
```

`commandId` is `playerId#sequence` for local and AI producers (deterministic, no UUID, no clock).

## State version and action history

`GameState` is deliberately **not** extended (that would change every state hash). The version lives next to it:

```ts
MatchState = { gameId, mode, assignments, version, lastSequence, initial, history: ActionRecord[], state }
ActionRecord = { actionId, gameId, sequence, stateVersion, turn:{round,activePlayer,phase}, playerId, side, command,
                 dice?: { rolls: number[], rngAfter } }
```

- `version` counts accepted actions and only grows. `history[i].stateVersion === i + 1`.
- Records hold no state copies and no timestamps; `dice` exists only when dice were rolled (raw d6 values and the
  RNG state afterwards, a cheap desync check).
- `replay(base, actions)` pushes the records back through `submit` from `initial` and verifies versions and dice.
  It returns `{ ok: false, atIndex, reason }` on any mismatch and never throws.

## Undo

- `mode: 'training'` (all single-player play today): local undo is allowed. The store keeps **whole-match snapshots**
  (`history: MatchState[]`), so undo restores state, version, sequence counters and action history together.
  Policy (`isLocallyUndoable`): dice-free, not `endPhase`, decision stays with the local player; unchanged from before.
- `mode: 'shared'` (future multiplayer): `isLocallyUndoable` is always false and `undoTo` returns null. This is enforced
  in the pure layer, not by hiding a button. Rollback networking is out of scope.
- Deployment (`placeUnit`, `editTerrain`) has its own separate undo stack and is not part of the match yet.

## Persistence

`SCHEMA_VERSION` (1) still versions the `GameState` shape; the coach records depend on it. The new
`SAVE_FORMAT` (2) versions the file envelope:

| Format | Layout |
|---|---|
| 1 / absent | `{ schemaVersion, savedAt, human, state }` |
| 2 | adds `match`: `{ gameId, mode, assignments, version, lastSequence, initial, history }` (`state` stays top-level, not duplicated) |

`deserialize` always returns a file with a `match` block. A format-1 file, or a format-2 file whose block is damaged
(wrong shape, `history.length !== version`), gets a fresh deterministic match: assignments from `human`, replay base =
the loaded state, id `legacy-<scenario>-<rng>`. A newer format is rejected with a message; other state schemas are still rejected.

Autosave runs on every command and shares the browser quota with token photos, so `saveMatch` retries without
the match block when the full save fails instead of losing the whole save. Measured (AI vs AI, whole game): 13 to 127
actions, 24 to 151 KB full against 16 to 106 KB without history.

## Determinism audit

- Engine and match layer: no `Date`, `Math.random`, `crypto`; iteration is over arrays (and insertion-ordered `Map`s).
- Outside the pure layer, nondeterminism is confined to the places that pick a seed or a label: `newGame` /
  `finishDeployment` (battle seed from `Date.now`/`Math.random`, game id derived from it), AI note ids, `savedAt` in save files.
  None of these enters `GameState` or an `ActionRecord`.
- Tests: AI-vs-AI through `submit` equals the plain `apply` loop; serialize, deserialize, replay reproduces the final state
  byte for byte; tampered history is detected.

## Future networking boundary

`src/game/match/transport.ts` holds types only (`MatchTransport`, `NetMessage`, `MatchSnapshot`, `PeerStatus`).
Intended integration (host-authoritative):

1. **Create / join**: the host builds `createMatch(state, assignments{ local, remote }, { gameId, mode: 'shared' })`;
   `MatchTransport.createMatch` / `joinMatch` exchange an invite token and the guest's `hello`.
2. **Guest** produces commands with the same `nextEnvelope(...)` and sends them with `sendCommand`; it does not apply
   them locally.
3. **Host** receives an envelope (`onCommand`), calls `store.submit(envelope)` (the same entry point as the local UI and the AI).
   It returns the `SubmitResult`: on `ok` the host broadcasts `result.action` (`broadcastAccepted`); otherwise it answers the sender
   with `sendRejected(senderId, commandId, result.code, result.reason)`. `unauthorized`, `stale-state`, `duplicate` and `bad-sequence` exist.
4. **Guests** get `onAccepted(action)` and re-apply it through `submit(match, envelopeOf(action))` (their local match equals the
   host's by determinism; `submit` also rejects it if the guest is out of step), and can verify `dice.rolls` / `rngAfter`.
   `onRejected` tells a guest that one of its own commands was refused.
5. **Disconnect / reconnect**: `onPeerStatus` reports changes; a returning peer calls `requestSync(haveVersion)`; the host's
   `onSyncRequest` handler answers with the missing actions or a full `MatchSnapshot` (`state` plus `meta` plus `history`).
6. **Shared matches are sealed in the store**: `matchOf` never rebuilds a `mode: 'shared'` match from a replaced `game`.

## Known gaps (deliberately out of scope)

- Deployment and terrain editing mutate the store directly, not through commands; a remote match needs deployment commands.
- Setup randomness (battle seed, first-turn roll-off via `startGame`) is decided by one side; a host must also own it.
- `settings.human` still drives the single-player UI (selection, hints); a two-human UI needs a per-viewer side.
- No state checksum is exchanged, only dice values and RNG state per action.
- `Command` has no `side`; faction abilities (`callWaaagh`) remain hard-wired to Orks in the engine. The Mechanicus commands `imperative` and `divineWork` are validated against the army's own state (`PlayerState.imperative`, the datasheet ability), not against a faction name, and travel through the match pipeline and the network protocol like any other command.
