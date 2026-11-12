# Online multiplayer (two players, PeerJS / WebRTC)

Host-authoritative. The host's browser owns the match and runs the **one** rules pipeline
(`match.submit` → `engine.validate` / `engine.apply`). The guest sends commands and renders what the host accepted.
`src/game` knows nothing about the network; only `src/multiplayer/peer.ts` imports `peerjs` (lazy `import()`).

## Files (`src/multiplayer`)

| File | Role |
|---|---|
| `protocol.ts` | typed `NetMessage`, `parseMessage` (size limit, shape, direction check), fixed ids `host` / `guest` |
| `link.ts` | `Link` = the only network surface host/guest logic sees; `memoryPair()` for tests |
| `peer.ts` | PeerJS adapter: `openPeer`, `connect`, signaling reconnect, env-based server config |
| `lobby.ts` | pure lobby rules (distinct factions, scenario supports both, start conditions) |
| `host.ts` / `guest.ts` | `HostSession` / `GuestSession`: all protocol logic, no PeerJS/React |
| `sync.ts` | snapshot encode/decode via the existing save format, `applyAccepted` (guest verification) |
| `reconnect.ts` | bounded backoff loop (1, 2, 4, 8 s … 8 attempts) |
| `session.ts` | glue: peer + sessions + store, the zustand `useMp` UI state, saved room records |
| `OnlineScreen.tsx` | lobby UI, in-battle connection chips and banner |
| `harness.ts` + `*.test.ts` | test doubles and tests (no network) |

## Flow

1. **Host**: “🌐 Play online together” → “Create a room”. A 6-character code is generated, registered as peer id `wh40k-tt-<CODE>`;
   invite link = `<app url>?room=<CODE>`.
2. **Guest**: code or link → PeerJS data channel to the host → `hello` (+ stored token when returning). Host answers `welcome`
   (host-issued secret token) and `lobby`. Guest picks a faction (`prefs`) and presses “I’m ready”.
   Host controls scenario and own faction; changing them resets readiness. Start needs: guest connected + ready, distinct factions, scenario with both armies.
   **Own army lists.** Each player builds a list beforehand in the army builder on the start screen, or pastes an army code there.
   - The host's list for its faction goes into the lobby when the room is created and whenever the host changes faction (`configureRoom`).
   - The guest's list goes with a faction pick and with “I’m ready” (`prefs.army`; `null` = the training roster).
   - The host checks it: `parseMessage` rejects a malformed list; `normalizeLobby` drops a list of the wrong faction and moves the room to “Combat Patrol”, the board that takes own lists. A new list needs a new “I’m ready”.
   - `startProblem` names a list that breaks the rules (`listProblems`).
   - The lobby shows “Training roster” or “Own roster: 495 / 500 pts, 6 units” for each side.
3. **Start**: host builds the battle (`startSharedHost`: host seed, both lists, `startGame`, the recommended deployment preset on “Combat Patrol” or the scenario's positions elsewhere, `mode: 'shared'`) and sends a full snapshot
   (`start`) in the normal save format.
4. **Command**: guest `command` envelope → host checks (a) the sender id equals the id bound to the connection (`guest`), (b) game id,
   then `submit`: shape, duplicate, sequence, state version, ownership (`decidingSide`), `validate`, `apply` with the host's seeded RNG.
   Accepted → `accepted` (the `ActionRecord` incl. raw d6 values and RNG state after) is sent to the guest; the host's own commands are
   broadcast the same way (store subscription). Rejected → `rejected` goes **only** to the sender; state, version and counters are untouched.
5. **Guest applies** the accepted action through `submit(envelopeOf(action))` from the host's RNG state and compares dice and version with the host's
   record. Any gap, mismatch or failure → `syncRequest` → host `snapshot`, which replaces the guest copy. The guest never sends state and
   never applies its own commands; only one command is in flight at a time.
6. **Reactions and re-roll questions** (Stratagems in the opponent's turn) wait for the deciding player at most 20 s (`DECISION_TIMEOUT`). After that the host submits the skip for them through the same pipeline; see `docs/stratagems.md`.
7. **Liveness**: guest pings every 5 s; either side treats 15–20 s of silence as a lost connection (PeerJS `close` is unreliable on abrupt drops).

## Reconnect and persistence

- **Guest drops** (tab closed, network lost): host marks it “The player disconnected.”, keeps the match; the slot stays reserved for the token holder.
  The guest retries automatically (8 attempts) and, if that fails, via “Reconnect”. Reload: the lobby menu offers “Return to game”
  (room code + token in `localStorage`). On return the host sends a full snapshot.
- **Host drops**: the guest shows “Connection lost / Reconnecting...”, then “The host is not responding”; commands are blocked. There is no host migration.
- **Host save**: every accepted action is autosaved under `wh40k-training-mp-save` (separate from the single-player `…-autosave`), room code and guest
  token under `wh40k-training-mp-host`. After a browser restart the host picks “Restore the game”: the same room code is re-registered and the
  returning guest gets the state back. A guest saves nothing. A finished game is not offered for restore.
- Undo, “Restart”, load and manual save are disabled in an online match (the pure layer already refuses undo in `shared` mode).

## Infrastructure

- **Signaling**: PeerJS Cloud (`0.peerjs.com`), a free shared service without an SLA, used only to exchange connection offers. No game data passes through it.
  To self-host run `npx peerjs --port 9000 --path /mp` and set (Vite env, e.g. `.env.local`):
  `VITE_PEER_HOST`, `VITE_PEER_PORT`, `VITE_PEER_PATH`, `VITE_PEER_SECURE` (`false` for plain http), optionally `VITE_PEER_ICE_SERVERS`
  (JSON array of RTCIceServer, e.g. your own STUN/TURN). Nothing secret is stored in the repository.
- **STUN/TURN**: by default PeerJS's built-in Google STUN and PeerJS TURN. Strict NATs or corporate networks may still fail to connect
  (the guest sees “Could not establish a direct connection”); a TURN server of your own is the fix.
- Needs HTTPS (or localhost) for the page, otherwise browsers restrict WebRTC.

## Security model and limits

- All incoming messages are untrusted: size limit (16 KB from the guest), strict shape and direction validation, unknown types dropped.
  The player id is taken from the connection, never from the message; a started game accepts only the token holder; at most two players.
- **Host-authoritative P2P gives no anti-cheat against a malicious host** (the host owns the state and the RNG). Fine for friends, not for ranked play.
- A guest also runs the rules locally to verify the host's action. This is verification, not a second source of truth; a mismatch is replaced by the host snapshot.
- The self-join guard works per tab (a hosting tab refuses its own code); a second tab of the same browser can join, which is handy for testing.
- If the browser storage quota is full, the host save falls back to a version without the match block and “Restore the game” disappears.
- Not implemented (out of scope): host migration, spectators, chat, matchmaking, manual deployment in online matches
  (armies start in the recommended preset or on the scenario's positions), recovery after a permanently gone host without its save.

## Manual two-browser test

1. `npm run dev`, open the app in two windows (a normal and a private one, or two devices on HTTPS/LAN).
2. Window A: “Play online together” → “Create a room”, copy the invitation link. Window B: open it (or enter the code).
3. B picks a faction → “I’m ready”. A picks scenario/faction → “Start the match”.
4. Play a few phases: only the active player's units can act; the other side sees the same board, dice and log.
5. Close window B's tab, reopen the app → online menu → “Return to game”: same state, the match continues.
6. Reload A's tab → “Restore the game”: B reconnects by itself (or via “Reconnect”).
7. Try a third window with the same code: “The game is already in progress” / “The room already has two players”.
