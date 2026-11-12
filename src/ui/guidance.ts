import { FACTION_NAME } from '../game/data/datasheets'
import { actor, hyperPending, moveAllowance, moveCommand, PHASE_NAME, stratagemActions, validate, type MoveOptions } from '../game/engine'
import { STRATAGEMS } from '../game/rules/stratagems'
import { alive, enemiesOf, findUnit, fmt, isDestroyed, sidesOf, unitsOf } from '../game/gameState'
import { deploymentIssues, deploymentProblem } from '../game/rules/deployment'
import { dist } from '../game/geometry/geometry'
import type { Command, GameState, Phase, PlayerId, UnitState, Vec } from '../game/types'
import { PHASES } from '../game/types'
import { DECISION_TIMEOUT } from '../multiplayer/host'
import { quote, tr } from '../i18n/index'

// Pure helpers that tell the player what they can do next. All legality
// comes from engine.validate — nothing here decides rules on its own.

const ok = (s: GameState, c: Command) => validate(s, c).ok

/** online: how long the other side may think about a reaction or a re-roll (multiplayer/host.ts DECISION_TIMEOUT) */
const WAIT_LIMIT = tr(' We wait no more than {value} s, then — a pass.', { value: DECISION_TIMEOUT / 1000 })

/** The command a click on `target` would issue for the selected unit, if any. */
export function targetCommand(s: GameState, unit: UnitState, target: UnitState): Command | null {
  if (s.pendingCharge?.unitId === unit.id) return { type: 'chargeMove', unitId: unit.id, targetIds: [target.id] }
  if (s.phase === 'shooting') return { type: 'shoot', unitId: unit.id, targetId: target.id }
  if (s.phase === 'fight') return { type: 'fight', unitId: unit.id, targetId: target.id }
  return null
}

/** Can this unit still do something useful in the current phase? */
export function canActNow(s: GameState, u: UnitState): boolean {
  if (isDestroyed(u) || u.owner !== actor(s) || s.winner || s.reaction || s.pendingReroll || hyperPending(s)) return false
  switch (s.phase) {
    case 'movement':
      return u.move === 'none'
    case 'shooting':
      return enemiesOf(s, u).some((e) => ok(s, { type: 'shoot', unitId: u.id, targetId: e.id }))
    case 'charge':
      return s.pendingCharge ? s.pendingCharge.unitId === u.id : ok(s, { type: 'declareCharge', unitId: u.id })
    case 'fight':
      return enemiesOf(s, u).some((e) => ok(s, { type: 'fight', unitId: u.id, targetId: e.id }))
    default:
      return false
  }
}

export const actionableUnits = (s: GameState, p: PlayerId) => unitsOf(s, p).filter((u) => canActNow(s, u))

/** Has this unit already used its action in the current phase? */
export function actedThisPhase(s: GameState, u: UnitState): boolean {
  switch (s.phase) {
    case 'movement': return u.move !== 'none'
    case 'shooting': return u.shot
    case 'charge': return u.chargeDeclared
    case 'fight': return u.fought
    default: return false
  }
}

/**
 * Ending the phase is allowed but some units could still act (all such
 * actions are optional). Returns a reminder, or null when nothing is left.
 */
export function endPhaseWarning(s: GameState, human: PlayerId): string | null {
  if (actor(s) !== human || s.winner || !ok(s, { type: 'endPhase' })) return null
  if (s.phase === 'command' && s.players[human].imperative === null)
    return tr('No Imperative chosen: “Protector” boosts shooting, “Conqueror” — melee and armour penetration. It is free and chosen every turn. Press again to continue without it.')
  const last = lastRoundWarning(s, human)
  if (s.phase === 'movement' && last) return tr('{last} Press again to finish the move.', { last })
  const ready = actionableUnits(s, human)
  const verb: Partial<Record<Phase, string>> = { movement: tr('move'), shooting: tr('shoot'), charge: tr('declare a charge') }
  if (ready.length && verb[s.phase]) return tr('Can still {item}: {list}. It is optional — press again to move on.', { item: verb[s.phase], list: ready.map((u) => quote(u.name)).join(', ') })
  const cp = cpReminder(s, human)
  return cp ? tr('{cp} Press again to continue without a Stratagem.', { cp }) : null
}

/** CP worth a nudge: at this many the player is sitting on points that could already have bought something. */
export const CP_HOARD = 3

/** The Stratagems usable right now, once each by name. */
export function usableStratagemNames(s: GameState, human: PlayerId): string[] {
  const names = new Set<string>()
  for (const u of unitsOf(s, human)) for (const a of stratagemActions(s, u.id)) if (a.cmd?.type === 'stratagem') names.add(STRATAGEMS[a.cmd.id].name)
  return [...names]
}

/**
 * The player has CP_HOARD or more CP, a Stratagem is usable now and none was used this phase: CP left unspent buy
 * nothing (they piled up to 5–10 by the end of the player's games). Null otherwise.
 */
export function cpReminder(s: GameState, human: PlayerId): string | null {
  const p = s.players[human]
  if (s.winner || actor(s) !== human || p.cp < CP_HOARD || (p.stratagemsThisPhase ?? []).length) return null
  const names = usableStratagemNames(s, human)
  if (!names.length) return null
  return tr('💡 You have {cp} CP, and right now you can use: {list} (the “📜 Stratagems” card on the right). Unspent CP do nothing.', { cp: p.cp, list: names.map((n) => quote(n)).join(', ') })
}

/**
 * Last battle round, the player moves first (so the opponent still has a turn) and is not behind on points: a wiped-out
 * army loses whatever the score, so at least one unit should survive. Null otherwise.
 */
export function lastRoundWarning(s: GameState, human: PlayerId): string | null {
  if (s.winner || s.round < s.maxRounds || s.activePlayer !== human || s.firstPlayer !== human) return null
  const foe = sidesOf(s).find((f) => f !== human)!
  const me = s.players[human].vp
  const them = s.players[foe].vp
  if (me < them) return null
  return tr('⚠ The last round, and the opponent moves after you. {value}. If your army is destroyed entirely it is a defeat, even with a points lead. Hide at least one unit behind opaque ruins and more than 12″ from the enemy.', { value: me > them ? tr('You are leading {me}:{them}', { me, them }) : tr('The score is level {me}:{them}', { me, them }) })
}

/** Who can still act, and whether the engine lets the phase end now (and why not). */
export function phaseStatus(s: GameState, human: PlayerId): { ready: UnitState[]; canEnd: boolean; reason?: string } {
  const ready = actionableUnits(s, human)
  const v = validate(s, { type: 'endPhase' })
  return v.ok ? { ready, canEnd: true } : { ready, canEnd: false, reason: v.reason }
}

/** Largest straight-line distance any model moved in the draft. */
export const draftDistance = (u: UnitState, draft: Record<string, Vec>) =>
  Math.max(0, ...alive(u).map((m) => (draft[m.id] ? dist(m.pos, draft[m.id]) : 0)))

/** Deployment step hint. `placed` = ids of units the player has confirmed. */
export function deploymentHint(s: GameState, human: PlayerId, ui: { selectedUnitId: string | null; draft: Record<string, Vec>; placed: string[] }): Hint {
  const sel = ui.selectedUnitId ? findUnit(s, ui.selectedUnitId) : undefined
  const mine = sel && sel.owner === human ? sel : undefined
  if (mine && Object.keys(ui.draft).length) {
    const why = deploymentProblem(s, mine, ui.draft)
    return why ? { text: why, tone: 'warn' } : { text: tr('The position is legal — press “✓ Place “{name}”” (Enter). Esc — put it back.', { name: mine.name }), tone: 'action' }
  }
  if (mine && !ui.placed.includes(mine.id))
    return { text: tr('Drag the model “{name}” inside the highlighted zone (the whole unit moves by default) or just press “✓ Place”.', { name: mine.name }), tone: 'action' }
  const left = deploymentIssues(s, human, ui.placed)
  if (!left.length) return { text: tr('All units are placed. Press “Start the battle ▶” — a dice roll will decide who goes first.'), tone: 'action' }
  return { text: tr('Pick a unit with a green frame — it is not placed yet. {item}', { item: left[0] }), tone: 'action' }
}

export const PHASE_SHORT: Record<Phase, string> = { command: tr('Command|phase'), movement: tr('Movement|phase'), shooting: tr('Shooting'), charge: tr('Charge|phase'), fight: tr('Fight|phase') }

export function nextPhaseLabel(s: GameState): string {
  const i = PHASES.indexOf(s.phase)
  if (i === PHASES.length - 1) return tr('End turn')
  return tr('Next: {item}', { item: PHASE_SHORT[PHASES[i + 1]] })
}

export interface Hint {
  text: string
  tone: 'info' | 'action' | 'warn' | 'wait'
}

export function nextStepHint(
  s: GameState,
  human: PlayerId,
  ui: { selectedUnitId: string | null; draft: Record<string, Vec>; measuring: boolean; aimTargetId?: string | null; groupDrag?: boolean; aimFirst?: boolean; moveOptions?: MoveOptions; shared?: object | null },
): Hint {
  if (s.winner) return { text: s.winner === 'draw' ? tr('The battle is over: a draw.') : tr('The battle is over: victory — {item}.', { item: FACTION_NAME[s.winner] }), tone: 'info' }
  if (hyperPending(s))
    return human === 'tyranids'
      ? { text: tr('Start of the battle: choose the Tyranids’ hyper-adaptation — it lasts until the end of the battle.'), tone: 'action' }
      : { text: tr('{value} (Tyranids) is choosing a hyper-adaptation for the whole battle…', { value: ui.shared ? tr('Opponent|short') : tr('AI|alt') }), tone: 'wait' }
  if (s.pendingReroll)
    return s.pendingReroll.player === human
      ? { text: tr('Command Re-roll: decide whether to re-roll the die.'), tone: 'action' }
      : { text: tr('{value} ({item}) is deciding whether to re-roll the die…{value2}', { value: ui.shared ? tr('Opponent|short') : tr('AI|alt'), item: FACTION_NAME[s.pendingReroll.player], value2: ui.shared ? WAIT_LIMIT : '' }), tone: 'wait' }
  if (s.reaction?.window === 'beforeShockTests')
    return s.reaction.player === human
      ? { text: tr('Before the Battle-shock test you can use “Insane Bravery”.'), tone: 'action' }
      : { text: tr('{value} ({item}) is deciding whether to use “Insane Bravery”…{value2}', { value: ui.shared ? tr('Opponent|short') : tr('AI|alt'), item: FACTION_NAME[s.reaction.player], value2: ui.shared ? WAIT_LIMIT : '' }), tone: 'wait' }
  if (s.reaction?.window === 'onTargeted' || s.reaction?.window === 'afterAttacks')
    return s.reaction.player === human
      ? { text: s.reaction.window === 'onTargeted' ? tr('Your unit was picked as an attack target: you can answer with a Stratagem before the rolls.') : tr('Your unit lost models: you can start reanimation with a Stratagem.'), tone: 'action' }
      : { text: tr('{value} ({item}) is deciding whether to answer with a Stratagem…{value2}', { value: ui.shared ? tr('Opponent|short') : tr('AI|alt'), item: FACTION_NAME[s.reaction.player], value2: ui.shared ? WAIT_LIMIT : '' }), tone: 'wait' }
  if (s.reaction)
    return s.reaction.player === human
      ? { text: tr('Opponent’s turn: you can answer with a reaction Stratagem or pass.'), tone: 'action' }
      : { text: tr('{value} ({item}) is deciding whether to answer with a reaction…{value2}', { value: ui.shared ? tr('Opponent|short') : tr('AI|alt'), item: FACTION_NAME[s.reaction.player], value2: ui.shared ? WAIT_LIMIT : '' }), tone: 'wait' }
  if (actor(s) !== human) return { text: tr('{value} ({item}) is playing — {item2}…', { value: ui.shared ? tr('opponent|label') : tr('AI|alt'), item: FACTION_NAME[actor(s)], item2: PHASE_NAME[s.phase] }), tone: 'wait' }
  if (ui.measuring) return { text: tr('Ruler: click two points or two models. Esc — turn off.'), tone: 'info' }

  const sel = ui.selectedUnitId ? findUnit(s, ui.selectedUnitId) : undefined
  const mine = sel && sel.owner === human && !isDestroyed(sel) ? sel : undefined
  const ready = actionableUnits(s, human)
  const done = { text: tr('There is nothing more to do in this phase. Press “{nextPhaseLabel}”.', { nextPhaseLabel: nextPhaseLabel(s) }), tone: 'action' as const }

  switch (s.phase) {
    case 'command':
      return { text: tr('Command phase: Command Points received.{value}{value2}{value3} Press “{nextPhaseLabel}”.', { value: human === 'orks' && !s.players.orks.waaaghUsed ? tr(' You can call WAAAGH!') : '', value2: s.players[human].shadowUsed === false ? tr(' You can use “Shadow in the Warp” (once per battle).') : '', value3: s.players[human].imperative === null ? tr(' Choose an Imperative (Protector or Conqueror) — it is an army rule.') : '', nextPhaseLabel: nextPhaseLabel(s) }), tone: 'action' }
    case 'movement': {
      if (mine && mine.move !== 'none') {
        const after = mine.move === 'advance' ? tr(' After an Advance it cannot charge and shoots only with Assault weapons.') : mine.move === 'fallBack' ? tr(' After falling back it neither shoots nor charges this turn.') : ''
        return { text: tr('“{name}” has already moved.{after} {value} or go on to shooting.', { name: mine.name, after, value: ready.length ? tr('You can move another unit (green frame)') : tr('There are no other units to move') }), tone: 'action' }
      }
      if (!mine) return ready.length ? { text: tr('Pick a unit with a green frame — it can still move. Moving is optional: you can press “{nextPhaseLabel}” right away.', { nextPhaseLabel: nextPhaseLabel(s) }), tone: 'action' } : done
      const mo = ui.moveOptions ?? { fly: false, swift: false }
      const allow = moveAllowance(s, mine, mo)
      if (Object.keys(ui.draft).length === 0)
        return {
          text: ui.groupDrag === false
            ? tr('“One model at a time” mode: move any models of “{name}” individually (up to {fmt}″ each), the rest stay in place. Then one “Confirm”.', { name: mine.name, fmt: fmt(allow) })
            : tr('Drag the model “{name}” — the whole unit will move, up to {fmt}″ (the dashed circle is the limit). If you need one or two models, choose “One model at a time” below.', { name: mine.name, fmt: fmt(allow) }),
          tone: 'action',
        }
      const v = validate(s, moveCommand(s, mine, ui.draft, mo))
      return v.ok
        ? { text: tr('The position is legal ({fmt}″ of {fmt2}″) — press “Confirm” (Enter). Esc — put the models back.', { fmt: fmt(draftDistance(mine, ui.draft)), fmt2: fmt(allow) }), tone: 'action' }
        : { text: tr('{reason} Move the model or press Esc to put it back.', { reason: v.reason }), tone: 'warn' }
    }
    case 'shooting':
      if (!mine || !canActNow(s, mine))
        return ready.length ? { text: tr('Pick a unit with a green frame — it can shoot{value}. Shooting is optional.', { value: mine?.shot ? tr(' (“{name}” has already shot)', { name: mine.name }) : '' }), tone: 'action' } : done
      if (ui.aimTargetId) {
        const aim = findUnit(s, ui.aimTargetId)
        return { text: tr('Target: “{name}”. On the right — how many attacks and what you need to roll. When ready — “🎯 Fire”; we will show the rolls step by step.', { name: aim?.name }), tone: 'action' }
      }
      return ui.aimFirst
        ? { text: tr('Click an enemy with a green highlight to choose a target (we will not shoot right away). A red highlight — hover to learn the reason.'), tone: 'action' }
        : { text: tr('Click an enemy model: a green highlight means you can shoot, a red one — hover to learn the reason.'), tone: 'action' }
    case 'charge':
      if (s.pendingCharge) return { text: tr('Rolled {roll}″. Click a highlighted enemy to charge, or give up.', { roll: s.pendingCharge.roll }), tone: 'action' }
      if (!mine || !canActNow(s, mine)) return ready.length ? { text: tr('Pick a unit with a green frame — it can declare a charge.'), tone: 'action' } : done
      return { text: tr('Press “Declare a charge”: a 2D6 roll will show how far the unit can dash.'), tone: 'action' }
    case 'fight':
      if (!s.fight) return done
      if (!mine || !canActNow(s, mine)) return ready.length ? { text: tr('Pick a unit with a green frame — it has to fight.'), tone: 'action' } : done
      return { text: tr('Click an enemy model in engagement range to fight.'), tone: 'action' }
  }
}
