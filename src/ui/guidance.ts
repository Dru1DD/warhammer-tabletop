import { FACTION_NAME } from '../game/data/datasheets'
import { actor, maxMove, moveModeFor, PHASE_NAME, validate } from '../game/engine'
import { enemiesOf, findUnit, fmt, isDestroyed, unitsOf } from '../game/gameState'
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

export function nextPhaseLabel(s: GameState): string {
  const i = PHASES.indexOf(s.phase)
  if (i === PHASES.length - 1) return 'Завершить ход'
  const short: Record<Phase, string> = { command: 'Командование', movement: 'Движение', shooting: 'Стрельба', charge: 'Атака', fight: 'Бой' }
  return `Далее: ${short[PHASES[i + 1]]}`
}

export interface Hint {
  text: string
  tone: 'info' | 'action' | 'warn' | 'wait'
}

export function nextStepHint(
  s: GameState,
  human: PlayerId,
  ui: { selectedUnitId: string | null; draft: Record<string, Vec>; measuring: boolean },
): Hint {
  if (s.winner) return { text: s.winner === 'draw' ? 'Битва окончена: ничья.' : `Битва окончена: победа — ${FACTION_NAME[s.winner]}.`, tone: 'info' }
  if (actor(s) !== human) return { text: `Ходит ИИ (${FACTION_NAME[actor(s)]}) — ${PHASE_NAME[s.phase]}…`, tone: 'wait' }
  if (ui.measuring) return { text: 'Линейка: щёлкните две точки или две модели. Esc — выключить.', tone: 'info' }

  const sel = ui.selectedUnitId ? findUnit(s, ui.selectedUnitId) : undefined
  const mine = sel && sel.owner === human && !isDestroyed(sel) ? sel : undefined
  const ready = actionableUnits(s, human)
  const done = { text: `Все отряды сделали, что могли. Нажмите «${nextPhaseLabel(s)}».`, tone: 'action' as const }

  switch (s.phase) {
    case 'command':
      return { text: `Фаза командования: очки командования получены.${human === 'orks' && !s.players.orks.waaaghUsed ? ' Можно объявить WAAAGH!' : ''} Нажмите «${nextPhaseLabel(s)}».`, tone: 'action' }
    case 'movement': {
      if (!mine || mine.move !== 'none')
        return ready.length ? { text: 'Выберите отряд с зелёной рамкой — он ещё может двигаться.', tone: 'action' } : done
      if (Object.keys(ui.draft).length === 0)
        return { text: `Перетащите модель «${mine.name}» (до ${fmt(maxMove(mine))}″, пунктир — предел). Не хотите двигаться — просто выберите другой отряд.`, tone: 'action' }
      const v = validate(s, { type: 'move', unitId: mine.id, mode: moveModeFor(s, mine), positions: ui.draft })
      return v.ok ? { text: 'Позиция допустима — нажмите «Подтвердить» (Enter). Esc — отменить.', tone: 'action' } : { text: v.reason, tone: 'warn' }
    }
    case 'shooting':
      if (!mine || !canActNow(s, mine)) return ready.length ? { text: 'Выберите отряд с зелёной рамкой — он может стрелять.', tone: 'action' } : done
      return { text: 'Щёлкните по вражеской модели: зелёная подсветка — можно стрелять, красная — наведите, чтобы узнать причину.', tone: 'action' }
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
