// Online lobby UI (Russian). Menu -> room (host or guest) -> the normal battle screen takes over when the match starts.

import { useState } from 'react'
import { FACTION_STYLE } from '../assets/manifest'
import { FACTION_NAME } from '../game/data/datasheets'
import { actor } from '../game/engine'
import { SCENARIOS } from '../game/scenarios/scenarios'
import { FACTIONS, type PlayerId } from '../game/types'
import { useStore } from '../store'
import { listPoints } from '../game/army/armyList'
import { armyLine, guestChoices, startProblem } from './lobby'
import {
  closeOnlineMenu, configureRoom, createRoom, inviteLink, joinRoom, leaveRoom, retryReconnect, savedGuestRoom, savedHostGame, setGuestPrefs,
  startRoomMatch, STATUS_TEXT, useMp,
} from './session'
import { tr } from '../i18n/index'

export function OnlineScreen() {
  const mp = useMp()
  return (
    <div className="min-h-full bg-stone-900 p-4 text-stone-100">
      <div className="mx-auto max-w-3xl rounded-lg border border-stone-700 bg-stone-800 p-6 shadow-xl">
        <h1 className="text-2xl font-bold">{tr('Online game for two')}</h1>
        {mp.screen === 'menu' ? <OnlineMenu /> : <Room />}
      </div>
    </div>
  )
}

function OnlineMenu() {
  const mp = useMp()
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room') ?? '')
  const hostGame = savedHostGame()
  const guestRoom = savedGuestRoom()
  return (
    <>
      <p className="mt-1 text-sm text-stone-400">
        {tr('A game directly between two browsers: one creates a room and becomes the host, the other joins by code or link. The host must keep the page open.')}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <section className="rounded border border-stone-600 p-3">
          <h2 className="font-semibold">{tr('Host')}</h2>
          <button className="btn btn-primary mt-2 w-full" disabled={mp.busy} onClick={() => void createRoom()}>{tr('Create a room')}</button>
          {hostGame && (
            <button className="btn mt-2 w-full" disabled={mp.busy} onClick={() => void createRoom(hostGame)}>
              {tr('↺ Restore the game (round {round}) in room {code}', { round: hostGame.match.state.round, code: hostGame.session.code })}
            </button>
          )}
        </section>
        <section className="rounded border border-stone-600 p-3">
          <h2 className="font-semibold">{tr('Guest')}</h2>
          <label className="mt-2 block text-sm">{tr('Room code or link')}
            <input className="input uppercase" value={code} placeholder={tr('for example, K7M2QX')} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void joinRoom(code)} />
          </label>
          <button className="btn btn-primary mt-2 w-full" disabled={mp.busy || !code.trim()} onClick={() => void joinRoom(code)}>{tr('Join the room')}</button>
          {guestRoom && (
            <button className="btn mt-2 w-full" disabled={mp.busy} onClick={() => void joinRoom(guestRoom.code, guestRoom.token)}>{tr('↺ Return to game {code}', { code: guestRoom.code })}</button>
          )}
        </section>
      </div>
      {mp.error && <p className="mt-3 text-sm text-rose-300" role="alert">{mp.error}</p>}
      <button className="btn mt-4" onClick={() => closeOnlineMenu()}>{tr('← Back')}</button>
    </>
  )
}

function Room() {
  const mp = useMp()
  const [copied, setCopied] = useState(false)
  const lobby = mp.lobby
  const isHost = mp.role === 'host'
  const failed = mp.status === 'failed'
  const guestOnline = isHost ? mp.guest === 'connected' : mp.status === 'connected'
  const problem = lobby ? startProblem({ ...lobby, guestConnected: mp.guest === 'connected' }) : tr('The room is being created.')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(mp.code!))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt(tr('Copy the invitation link:'), inviteLink(mp.code!))
    }
  }
  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded bg-stone-700 px-2 py-0.5">{isHost ? tr('You are the host') : tr('You are the guest')}</span>
        <span className={failed ? 'text-rose-300' : mp.status === 'connected' ? 'text-emerald-300' : 'text-amber-300'} role="status">{STATUS_TEXT[mp.status]}</span>
      </div>

      {mp.code && (
        <div className="mt-3 rounded border border-stone-600 bg-stone-900 p-3">
          <div className="text-xs text-stone-400">{tr('Room code')}</div>
          <div className="font-mono text-3xl tracking-widest" aria-label={tr('Room code')}>{mp.code}</div>
          {isHost && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button className="btn" onClick={() => void copy()}>{copied ? tr('Copied ✓') : tr('Copy the invitation link')}</button>
              <span className="text-xs text-stone-400">{tr('Send it to the second player.')}</span>
            </div>
          )}
        </div>
      )}

      {lobby && !failed && (
        <>
          <h2 className="mt-4 font-semibold">{tr('Players')}</h2>
          <ul className="mt-1 space-y-1 text-sm">
            <li className="flex items-center gap-2 rounded bg-stone-900 p-2">
              <span className="w-24 text-stone-400">{tr('Host')}</span>
              <FactionBadge side={lobby.hostSide} />
              <span className="text-xs text-stone-400">{armyLine(lobby.hostArmy, listPoints)}</span>
              <span className="ml-auto text-emerald-300">{tr('● ready')}</span>
            </li>
            <li className="flex items-center gap-2 rounded bg-stone-900 p-2">
              <span className="w-24 text-stone-400">{tr('Guest')}</span>
              {guestOnline ? <FactionBadge side={lobby.guestSide} /> : <span className="text-stone-400">{tr('Waiting for the second player…')}</span>}
              {guestOnline && <span className="text-xs text-stone-400">{armyLine(lobby.guestArmy, listPoints)}</span>}
              {guestOnline && <span className={`ml-auto ${lobby.guestReady ? 'text-emerald-300' : 'text-amber-300'}`}>{lobby.guestReady ? tr('● ready') : tr('○ not ready')}</span>}
            </li>
          </ul>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">{tr('Scenario')}
              {isHost ? (
                <select className="input" value={lobby.scenarioId} onChange={(e) => configureRoom({ scenarioId: e.target.value })}>
                  {SCENARIOS.map((s) => {
                    const ok = s.factions.includes(lobby.hostSide) && s.factions.includes(lobby.guestSide)
                    return <option key={s.id} value={s.id} disabled={!ok}>{s.name}{ok ? '' : tr(' — no armies for this pair')}</option>
                  })}
                </select>
              ) : <div className="input">{SCENARIOS.find((s) => s.id === lobby.scenarioId)?.name}</div>}
            </label>
            <label className="text-sm">{tr('Host’s faction')}
              {isHost ? (
                <select className="input" value={lobby.hostSide} onChange={(e) => configureRoom({ hostSide: e.target.value as PlayerId })}>
                  {FACTIONS.map((f) => <option key={f} value={f}>{FACTION_NAME[f]}</option>)}
                </select>
              ) : <div className="input">{FACTION_NAME[lobby.hostSide]}</div>}
            </label>
            {guestOnline && (
              <label className="text-sm">{tr('Guest’s faction')}
                {isHost ? (
                  <div className="input">{FACTION_NAME[lobby.guestSide]} <span className="text-stone-400">{tr('(the guest chooses)')}</span></div>
                ) : (
                  <select className="input" value={lobby.guestSide} onChange={(e) => setGuestPrefs({ side: e.target.value as PlayerId })}>
                    {guestChoices(lobby).map((f) => <option key={f} value={f}>{FACTION_NAME[f]}</option>)}
                  </select>
                )}
              </label>
            )}
          </div>
          <p className="mt-2 text-xs text-stone-400">
            {tr('Each player builds their own roster in advance in the army editor on the main screen (you can also paste an army code there). It goes to the room when you pick a faction and with the “I’m ready” button; own rosters are played in “Combat Patrol”. In “Combat Patrol” the armies take the recommended deployment, on the other maps — the scenario’s positions (manual placement in an online game is not possible yet). Explanations and hints work as usual.')}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {isHost ? (
              <>
                <button className="btn btn-primary" disabled={!!problem} title={problem ?? undefined} onClick={() => useMp.setState({ error: startRoomMatch() })}>{tr('Start the match')}</button>
                {problem && <span className="self-center text-xs text-stone-400">{problem}</span>}
              </>
            ) : guestOnline ? (
              <>
                <button className={`btn ${lobby.guestReady ? '' : 'btn-primary'}`} onClick={() => setGuestPrefs({ ready: !lobby.guestReady })}>{lobby.guestReady ? tr('I’m not ready') : tr('I’m ready')}</button>
                <span className="self-center text-xs text-stone-400">{lobby.guestReady ? tr('Waiting for the host to start the match.') : tr('Pick a faction and confirm you are ready.')}</span>
              </>
            ) : null}
          </div>
        </>
      )}

      {mp.error && <p className="mt-3 text-sm text-rose-300" role="alert">{mp.error}</p>}
      {failed && !isHost && mp.playing && <button className="btn btn-primary mt-3" onClick={() => retryReconnect()}>{tr('Reconnect')}</button>}
      <button className="btn mt-4" onClick={() => leaveRoom()}>{tr('Leave the room')}</button>
    </>
  )
}

function FactionBadge({ side }: { side: PlayerId }) {
  return <span className="rounded px-2 py-0.5 font-semibold" style={{ background: FACTION_STYLE[side].primary }}>{FACTION_NAME[side]}</span>
}

// ---------------------------------------------------------------- in-battle indicators

/** Header chips: connection, opponent, whose turn. Rendered only in an online match. */
export function OnlineHeader() {
  const mp = useMp()
  const shared = useStore((s) => s.shared)
  const game = useStore((s) => s.game)
  const human = useStore((s) => s.settings.human)
  if (!shared || !game) return null
  const opp = (game.sides ?? FACTIONS).find((f) => f !== human)!
  const mine = actor(game) === human
  const oppOk = shared.role === 'host' ? mp.guest === 'connected' : mp.status === 'connected'
  return (
    <>
      <span className={`rounded px-2 py-0.5 text-xs ${mp.status === 'connected' ? 'bg-emerald-900' : 'bg-amber-800'}`} title={STATUS_TEXT[mp.status]}>🌐 {STATUS_TEXT[mp.status]}</span>
      <span className="rounded bg-stone-800 px-2 py-0.5 text-xs">
        {tr('Opponent: {item} ·', { item: FACTION_NAME[opp] })} {oppOk ? tr('online') : tr('The player disconnected.')}
      </span>
      {!game.winner && <span className={`rounded px-2 py-0.5 text-sm font-semibold ${mine ? 'bg-yellow-600 text-black' : 'bg-stone-700'}`}>{mine ? tr('Your turn') : tr('Opponent’s turn')}</span>}
    </>
  )
}

/** Blocking notice when the other side is gone. The match is paused, not lost. */
export function OnlineBanner() {
  const mp = useMp()
  const shared = useStore((s) => s.shared)
  if (!shared) return null
  const host = shared.role === 'host'
  const gone = host ? mp.guest !== 'connected' : mp.status !== 'connected'
  if (!gone) return null
  return (
    <div className="absolute inset-x-0 top-0 z-[3] mx-auto mt-2 max-w-md rounded bg-amber-900/95 px-3 py-2 text-sm shadow" role="status">
      {host ? (
        <>
          <b>{tr('The player disconnected.')}</b> {tr('The game is saved, waiting for the second player to return (room code {code}). They can rejoin with the same code.', { code: mp.code })}
        </>
      ) : (
        <>
          <b>{STATUS_TEXT[mp.status === 'failed' ? 'lost' : mp.status]}</b>{' '}
          {mp.status === 'failed'
            ? <>{tr('The host is not responding: no moves are possible until they return.')} <button className="underline" onClick={() => retryReconnect()}>{tr('Reconnect')}</button></>
            : <>{tr('Moves are paused until the connection with the host is restored.')}</>}
        </>
      )}
    </div>
  )
}
