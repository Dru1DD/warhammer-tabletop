import { FACTION_NAME } from '../game/data/datasheets'
import { actor, maxMove, moveModeFor, PHASE_NAME, validate } from '../game/engine'
import { alive, enemiesOf, findUnit, fmt, isDestroyed, unitsOf } from '../game/gameState'
import { deploymentIssues, deploymentProblem } from '../game/rules/deployment'
import { dist } from '../game/geometry/geometry'
import type { Command, GameState, Phase, PlayerId, UnitState, Vec } from '../game/types'
import { PHASES } from '../game/types'

// Pure helpers that tell the player what they can do next. All legality
// comes from engine.validate — nothing here decides rules on its own.

const ok = (s: GameState, c: Command) => validate(s, c).ok

/** The command a click on `target` would issue for the selected unit, if any. */
export function targetCommand(s: GameState, unit: UnitState, target: UnitState): Command | null {
  if (s.pendingCharge?.unitId === unit.id) return { type: 'chargeMove', unitId: unit.id, targetIds: [target.id] }
  if (s.phase === 'shooting') return { type: 'shoot', unitId: unit.id, targetId: target.id }
  if (s.phase === 'fight') return { type: 'fight', unitId: unit.id, targetId: target.id }
  return null
}

/** Can this unit still do something useful in the current phase? */
export function canActNow(s: GameState, u: UnitState): boolean {
  if (isDestroyed(u) || u.owner !== actor(s) || s.winner) return false
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
  const ready = actionableUnits(s, human)
  if (!ready.length) return null
  const verb: Partial<Record<Phase, string>> = { movement: 'двигаться', shooting: 'стрелять', charge: 'объявить атаку' }
  if (!verb[s.phase]) return null
  return `Ещё могут ${verb[s.phase]}: ${ready.map((u) => `«${u.name}»`).join(', ')}. Это необязательно — нажмите ещё раз, чтобы перейти дальше.`
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
    return why ? { text: why, tone: 'warn' } : { text: `Позиция допустима — нажмите «✓ Поставить «${mine.name}»» (Enter). Esc — вернуть как было.`, tone: 'action' }
  }
  if (mine && !ui.placed.includes(mine.id))
    return { text: `Перетащите модель «${mine.name}» внутрь подсвеченной зоны (по умолчанию едет весь отряд) или сразу нажмите «✓ Поставить».`, tone: 'action' }
  const left = deploymentIssues(s, human, ui.placed)
  if (!left.length) return { text: 'Все отряды расставлены. Нажмите «Начать битву ▶» — броском кубиков определится, кто ходит первым.', tone: 'action' }
  return { text: `Выберите отряд с зелёной рамкой — он ещё не расставлен. ${left[0]}`, tone: 'action' }
}

export const PHASE_SHORT: Record<Phase, string> = { command: 'Командование', movement: 'Движение', shooting: 'Стрельба', charge: 'Атака', fight: 'Бой' }

export function nextPhaseLabel(s: GameState): string {
  const i = PHASES.indexOf(s.phase)
  if (i === PHASES.length - 1) return 'Завершить ход'
  return `Далее: ${PHASE_SHORT[PHASES[i + 1]]}`
}

export interface Hint {
  text: string
  tone: 'info' | 'action' | 'warn' | 'wait'
}

export function nextStepHint(
  s: GameState,
  human: PlayerId,
  ui: { selectedUnitId: string | null; draft: Record<string, Vec>; measuring: boolean; aimTargetId?: string | null; groupDrag?: boolean; aimFirst?: boolean },
): Hint {
  if (s.winner) return { text: s.winner === 'draw' ? 'Битва окончена: ничья.' : `Битва окончена: победа — ${FACTION_NAME[s.winner]}.`, tone: 'info' }
  if (actor(s) !== human) return { text: `Ходит ИИ (${FACTION_NAME[actor(s)]}) — ${PHASE_NAME[s.phase]}…`, tone: 'wait' }
  if (ui.measuring) return { text: 'Линейка: щёлкните две точки или две модели. Esc — выключить.', tone: 'info' }

  const sel = ui.selectedUnitId ? findUnit(s, ui.selectedUnitId) : undefined
  const mine = sel && sel.owner === human && !isDestroyed(sel) ? sel : undefined
  const ready = actionableUnits(s, human)
  const done = { text: `В этой фазе больше нечего делать. Нажмите «${nextPhaseLabel(s)}».`, tone: 'action' as const }

  switch (s.phase) {
    case 'command':
      return { text: `Фаза командования: очки командования получены.${human === 'orks' && !s.players.orks.waaaghUsed ? ' Можно объявить WAAAGH!' : ''} Нажмите «${nextPhaseLabel(s)}».`, tone: 'action' }
    case 'movement': {
      if (mine && mine.move !== 'none') {
        const after = mine.move === 'advance' ? ' После продвижения он не сможет атаковать (charge) и стреляет только оружием Assault.' : mine.move === 'fallBack' ? ' После отступления он не стреляет и не атакует в этот ход.' : ''
        return { text: `«${mine.name}» уже переместился.${after} ${ready.length ? 'Можно двигать другой отряд (зелёная рамка)' : 'Других отрядов для движения нет'} или перейти к стрельбе.`, tone: 'action' }
      }
      if (!mine) return ready.length ? { text: `Выберите отряд с зелёной рамкой — он ещё может двигаться. Двигаться необязательно: можно сразу нажать «${nextPhaseLabel(s)}».`, tone: 'action' } : done
      if (Object.keys(ui.draft).length === 0)
        return {
          text: ui.groupDrag === false
            ? `Режим «По одной модели»: двигайте любые модели «${mine.name}» по отдельности (до ${fmt(maxMove(mine))}″ каждая), остальные останутся на месте. Затем одно «Подтвердить».`
            : `Перетащите модель «${mine.name}» — сдвинется весь отряд, до ${fmt(maxMove(mine))}″ (пунктирный круг — предел). Нужна одна-две модели — выберите внизу «По одной модели».`,
          tone: 'action',
        }
      const v = validate(s, { type: 'move', unitId: mine.id, mode: moveModeFor(s, mine), positions: ui.draft })
      return v.ok
        ? { text: `Позиция допустима (${fmt(draftDistance(mine, ui.draft))}″ из ${fmt(maxMove(mine))}″) — нажмите «Подтвердить» (Enter). Esc — вернуть модели.`, tone: 'action' }
        : { text: `${v.reason} Подвиньте модель или нажмите Esc, чтобы вернуть её.`, tone: 'warn' }
    }
    case 'shooting':
      if (!mine || !canActNow(s, mine))
        return ready.length ? { text: `Выберите отряд с зелёной рамкой — он может стрелять${mine?.shot ? ` («${mine.name}» уже стрелял)` : ''}. Стрелять необязательно.`, tone: 'action' } : done
      if (ui.aimTargetId) {
        const aim = findUnit(s, ui.aimTargetId)
        return { text: `Цель: «${aim?.name}». Справа — сколько атак и что нужно выбросить. Готовы — «🎯 Огонь»; броски покажем по шагам.`, tone: 'action' }
      }
      return ui.aimFirst
        ? { text: 'Щёлкните по врагу с зелёной подсветкой, чтобы выбрать цель (стрелять сразу не будем). Красная подсветка — наведите, чтобы узнать причину.', tone: 'action' }
        : { text: 'Щёлкните по вражеской модели: зелёная подсветка — можно стрелять, красная — наведите, чтобы узнать причину.', tone: 'action' }
    case 'charge':
      if (s.pendingCharge) return { text: `Выпало ${s.pendingCharge.roll}″. Щёлкните по подсвеченному врагу, чтобы атаковать, или откажитесь.`, tone: 'action' }
      if (!mine || !canActNow(s, mine)) return ready.length ? { text: 'Выберите отряд с зелёной рамкой — он может объявить атаку (charge).', tone: 'action' } : done
      return { text: 'Нажмите «Объявить атаку»: бросок 2D6 покажет, как далеко отряд может рвануть.', tone: 'action' }
    case 'fight':
      if (!s.fight) return done
      if (!mine || !canActNow(s, mine)) return ready.length ? { text: 'Выберите отряд с зелёной рамкой — он должен сражаться.', tone: 'action' } : done
      return { text: 'Щёлкните по вражеской модели в контакте, чтобы сражаться.', tone: 'action' }
  }
}
