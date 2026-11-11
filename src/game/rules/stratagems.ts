import { alive, hasKeyword, isDestroyed, unitDistance } from '../gameState'
import type { GameState, Phase, PlayerId, StratagemId, UnitState } from '../types'

// Core Stratagems of the 11th edition that a player uses in their own turn (stage 1: no reactions in the opponent's
// turn yet). Each costs Command points (CP). A battle-shocked unit cannot be targeted by Stratagems (core rules
// 01.07), a unit can be targeted by one Stratagem per phase, and each Stratagem is used once per phase. Validation and
// effects live in the engine (validate / apply, command type 'stratagem'); this module holds the data and shared checks.

export interface StratagemInfo {
  id: StratagemId
  name: string
  nameEn: string
  cost: number
  phases: Phase[]
  /** what it does, in plain words */
  text: string
  /** when it pays off, for beginners */
  when: string
}

export const STRATAGEMS: Record<StratagemId, StratagemInfo> = {
  commandReroll: {
    id: 'commandReroll',
    name: 'Командный переброс',
    nameEn: 'Command Re-roll',
    cost: 1,
    phases: ['movement', 'charge'],
    text: 'Перебросить только что сделанный бросок продвижения (Advance) или бросок атаки (charge, оба кубика) этого отряда.',
    when: 'Когда атака сорвалась на 1–3″ или продвижение выпало слишком коротким, а от этого зависит важная цель.',
  },
  insaneBravery: {
    id: 'insaneBravery',
    name: 'Безумная храбрость',
    nameEn: 'Insane Bravery',
    cost: 1,
    phases: ['command'],
    text: 'Проверка боевого шока этого отряда в этой фазе командования считается пройденной. Раз за битву.',
    when: 'Когда в шоке оказался отряд на цели или рядом с ней: в шоке его OC = 0, и он не удержит цель.',
  },
  explosives: {
    id: 'explosives',
    name: 'Взрывчатка',
    nameEn: 'Explosives',
    cost: 1,
    phases: ['shooting'],
    text: 'Отряд с ключевым словом EXPLOSIVES (или GRENADES) вместо стрельбы бросает 6D6 в видимого врага не дальше 8″, не в контакте: каждая 4+ — смертельная рана.',
    when: 'Когда обычная стрельба отряда даёт меньше ~3 ран, например по бронированной цели: смертельные раны проходят сквозь любую броню.',
  },
  crushingImpact: {
    id: 'crushingImpact',
    name: 'Сокрушительный удар',
    nameEn: 'Crushing Impact',
    cost: 1,
    phases: ['charge'],
    text: 'Монстр или техника после атаки (charge) бросает столько D6, какова её Стойкость: каждая 5+ — смертельная рана врагу в контакте, каждая 1 — своему отряду (не больше 6 каждому).',
    when: 'Почти всегда, когда ваш монстр или техника врезались во врага и есть CP: в среднем треть кубиков ранит врага.',
  },
}

export const STRATAGEM_IDS = Object.keys(STRATAGEMS) as StratagemId[]
export const EXPLOSIVES_RANGE = 8
export const EXPLOSIVES_DICE = 6
/** Crushing Impact: at most this many mortal wounds per unit (the enemy's and your own) */
export const CRUSHING_MAX = 6

export const hasExplosives = (u: UnitState) => hasKeyword(u, 'EXPLOSIVES', 'GRENADES')

/** Used this phase by this player (each Stratagem once per phase). */
export const usedThisPhase = (s: GameState, p: PlayerId, id: StratagemId) => (s.players[p].stratagemsThisPhase ?? []).includes(id)

/** The unit was already the target of a Stratagem this phase (one per unit per phase). */
export const targetedThisPhase = (s: GameState, u: UnitState) => (s.players[u.owner].stratagemUnitsThisPhase ?? []).includes(u.id)

/** Explosives reach: an enemy unit within 8″ (visibility is checked by the engine). */
export const explosivesReach = (u: UnitState, e: UnitState) => !isDestroyed(e) && alive(e).length > 0 && unitDistance(u, e) <= EXPLOSIVES_RANGE + 1e-9
