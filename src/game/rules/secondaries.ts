import { FACTION_NAME } from '../data/datasheets'
import { dist, pointInPolygon } from '../geometry/geometry'
import { addLog, alive, isDestroyed, other, profileOf, radiusOf, sidesOf, unitNearObjective, unitsOf } from '../gameState'
import type { GameState, Objective, PlayerId, SecondaryId, SecondaryState, UnitState, Vec } from '../types'

// Secondary missions of the 44″×60″ battle (Mission Deck 2026-27, Wahapedia): the 16 cards without actions (Plunder and
// Cleanse are left out). Each player plays them Tactical (two cards drawn each Command phase, scored once) or Fixed (the
// same two cards all battle). The engine calls the hooks at the start of a Command phase and at the end of a turn; the
// "when drawn" choices are made by the game for both sides (docs/secondaries.md).

export const SECONDARY_CAP = 45
export const SECONDARY_ROUND_CAP = 15
/** a Fixed card scores at most this much in a battle */
export const FIXED_CARD_CAP = 20
/** cards marked "up to 5VP" score at most this much each time */
const UP_TO = 5

export const SECONDARY_IDS: SecondaryId[] = [
  'noPrisoners', 'overwhelmingForce', 'displayOfMight', 'outflank', 'beacon', 'grievousBlow', 'defendStronghold', 'engageAllFronts',
  'secureNoMansLand', 'forwardPosition', 'centreGround', 'assassination', 'temptingTarget', 'behindEnemyLines', 'bringItDown', 'burdenOfTrust',
]
/** the cards with a Fixed side (the ones whose card gives Fixed values) */
export const FIXED_IDS: SecondaryId[] = ['assassination', 'bringItDown', 'grievousBlow', 'engageAllFronts']

/** When a card is checked: any turn's end, the end of its owner's turn, or the end of the opponent's turn (or of round 5). */
type When = 'any' | 'yours' | 'theirs' | 'both'

export interface SecondaryCard {
  name: string
  nameEn: string
  when: When
  text: string
  /** the Fixed side, when the card has one */
  fixedText?: string
}

export const SECONDARY: Record<SecondaryId, SecondaryCard> = {
  noPrisoners: { name: 'Без пленных', nameEn: 'No Prisoners', when: 'any', text: 'Конец любого хода: 2 ПО за каждый вражеский отряд, уничтоженный в этот ход (до 5).' },
  overwhelmingForce: { name: 'Подавляющая сила', nameEn: 'Overwhelming Force', when: 'any', text: 'Конец любого хода: 3 ПО за каждый вражеский отряд, который начал ход у цели и уничтожен в этот ход (до 5).' },
  displayOfMight: { name: 'Демонстрация силы', nameEn: 'Display of Might', when: 'both', text: 'Если у вас больше отрядов (не в боевом шоке) целиком в нейтральной зоне, чем у противника: 2 ПО в конце вашего хода или 5 ПО в конце хода противника.' },
  outflank: { name: 'Обход с фланга', nameEn: 'Outflank', when: 'yours', text: 'Конец вашего хода: 3 ПО, если ваш отряд в 6″ от края поля и вне вашей территории; 5 ПО, если у противоположных краёв по отряду и хотя бы один вне вашей территории.' },
  beacon: { name: 'Маяк', nameEn: 'Beacon', when: 'theirs', text: 'Когда взята: игра выбирает ваш отряд-маяк (самый быстрый). Конец хода противника (или 5-го раунда): 3 ПО, если маяк вне вашей зоны расстановки, 5 ПО — если вне вашей территории.' },
  grievousBlow: { name: 'Тяжкий удар', nameEn: 'A Grievous Blow', when: 'any', text: 'Конец любого хода: 5 ПО за каждый уничтоженный в этот ход вражеский отряд из 13+ моделей (до 5). Нет таких отрядов — карта сразу меняется.', fixedText: 'Конец любого хода: 4 ПО за каждый уничтоженный вражеский отряд из 13+ моделей.' },
  defendStronghold: { name: 'Удержать оплот', nameEn: 'Defend Stronghold', when: 'theirs', text: 'Со 2-го раунда, конец хода противника (или 5-го раунда): 3 ПО, если вы держите свою домашнюю цель, и ещё 2, если в вашей зоне расстановки нет врагов. В 1-м раунде карта сразу меняется.' },
  engageAllFronts: { name: 'Бой на всех фронтах', nameEn: 'Engage on All Fronts', when: 'yours', text: 'Конец вашего хода: отряды целиком в трёх четвертях поля (дальше 6″ от центра) — 3 ПО, в четырёх — 5 ПО.', fixedText: 'Конец вашего хода: три четверти поля — 2 ПО, четыре — 4 ПО.' },
  secureNoMansLand: { name: 'Нейтральная зона за нами', nameEn: "Secure No Man's Land", when: 'yours', text: 'Конец вашего хода: 5 ПО, если вы держите две или больше целей в нейтральной зоне (кроме домашних).' },
  forwardPosition: { name: 'Передовая позиция', nameEn: 'Forward Position', when: 'yours', text: 'Конец вашего хода: 5 ПО, если вы держите домашнюю цель противника или обе фланговые цели. В 1-м раунде карта сразу меняется.' },
  centreGround: { name: 'Центр поля', nameEn: 'Centre Ground', when: 'yours', text: 'Конец вашего хода: 3 ПО, если ваш отряд в 3″ от центра поля, а врагов там нет; 5 ПО, если врагов нет и в 6″.' },
  assassination: { name: 'Убийство', nameEn: 'Assassination', when: 'any', text: 'Конец любого хода: 5 ПО, если в этот ход убит вражеский персонаж или убиты все.', fixedText: 'Конец любого хода: 3 ПО за каждого убитого в этот ход вражеского персонажа, +1 ПО, если у него 4+ ран.' },
  temptingTarget: { name: 'Соблазнительная цель', nameEn: 'A Tempting Target', when: 'yours', text: 'Когда взята: противник выбирает цель в нейтральной зоне (выбирает игра — самую далёкую от вас). Конец вашего хода: 5 ПО, если вы её держите.' },
  behindEnemyLines: { name: 'В тылу врага', nameEn: 'Behind Enemy Lines', when: 'yours', text: 'Конец вашего хода: 3 ПО за каждый ваш отряд целиком в зоне расстановки противника (до 5). В 1-м раунде карта сразу меняется.' },
  bringItDown: { name: 'Свалить гиганта', nameEn: 'Bring It Down', when: 'any', text: 'Конец любого хода: 5 ПО за каждую уничтоженную в этот ход вражескую модель с 10+ ранами (до 5). Нет таких моделей — карта сразу меняется.', fixedText: 'Конец любого хода: 4 ПО за каждую уничтоженную вражескую модель с 10+ ранами.' },
  burdenOfTrust: { name: 'Бремя доверия', nameEn: 'Burden of Trust', when: 'theirs', text: 'Когда взята и в начале вашего хода: ваши отряды у ваших целей берут их под охрану. Конец хода противника (или 5-го раунда): 2 ПО за каждую цель, которую охрана удержала (до 5).' },
}

// ---------------------------------------------------------------- set-up

/** A shuffled deck (Fisher–Yates with `rnd`). */
export function shuffledDeck(rnd = Math.random): SecondaryId[] {
  const d = [...SECONDARY_IDS]
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

/** A player's secondaries: Tactical with a shuffled deck, or Fixed with two Fixed cards. */
export function newSecondary(mode: 'tactical' | 'fixed', fixed: SecondaryId[] = ['assassination', 'bringItDown'], rnd = Math.random): SecondaryState {
  const cards = fixed.filter((c) => FIXED_IDS.includes(c)).slice(0, 2)
  if (mode === 'fixed' && cards.length < 2) for (const c of FIXED_IDS) if (cards.length < 2 && !cards.includes(c)) cards.push(c)
  return {
    mode,
    deck: mode === 'tactical' ? shuffledDeck(rnd) : [],
    active: mode === 'fixed' ? cards : [],
    achieved: [],
    discarded: [],
    byRound: [0, 0, 0, 0, 0, 0],
    cardVp: {},
    swapUsed: false,
    toDiscard: [],
  }
}

export const secondaryTotal = (st: SecondaryState) => st.byRound.reduce((a, b) => a + b, 0)

// ---------------------------------------------------------------- geometry of the cards

const westOf = (s: GameState, p: PlayerId) => sidesOf(s)[0] === p
const zoneOf = (s: GameState, p: PlayerId): Vec[] => s.deployment?.[westOf(s, p) ? 'west' : 'east'] ?? []
const territoryOf = (s: GameState, p: PlayerId): Vec[] => s.territory?.[westOf(s, p) ? 'west' : 'east'] ?? []
const centre = (s: GameState): Vec => ({ x: s.board.width / 2, y: s.board.height / 2 })
const eligible = (s: GameState, p: PlayerId) => unitsOf(s, p).filter((u) => !u.battleShocked)

/** wholly within No Man's Land: no model in either deployment zone */
const inNoMansLand = (s: GameState, u: UnitState) => alive(u).every((m) => sidesOf(s).every((p) => !pointInPolygon(m.pos, zoneOf(s, p))))
const whollyIn = (u: UnitState, poly: Vec[]) => poly.length > 0 && alive(u).every((m) => pointInPolygon(m.pos, poly))
const touches = (u: UnitState, poly: Vec[]) => alive(u).some((m) => pointInPolygon(m.pos, poly))
const objInNoMansLand = (s: GameState, o: Objective) => sidesOf(s).every((p) => !pointInPolygon(o.pos, zoneOf(s, p)))
const isHomeOf = (o: Objective, p: PlayerId) => o.role === 'home' && o.home === p

/** The quarter a unit is wholly within, more than 6″ from the centre (0–3), or null. */
function quarterOf(s: GameState, u: UnitState): number | null {
  const c = centre(s)
  const q = (m: { pos: Vec }) => (m.pos.x < c.x ? 0 : 1) + (m.pos.y < c.y ? 0 : 2)
  const ms = alive(u)
  if (!ms.length) return null
  const first = q(ms[0])
  for (const m of ms) {
    const r = radiusOf(m)
    if (q(m) !== first || dist(m.pos, c) - r <= 6) return null
    if (Math.abs(m.pos.x - c.x) < r || Math.abs(m.pos.y - c.y) < r) return null
  }
  return first
}

/** Which board edges a unit is within 6″ of: 0 west, 1 east, 2 north, 3 south. */
function edgesNear(s: GameState, u: UnitState): number[] {
  const out = new Set<number>()
  for (const m of alive(u)) {
    const r = radiusOf(m)
    if (m.pos.x - r <= 6) out.add(0)
    if (s.board.width - m.pos.x - r <= 6) out.add(1)
    if (m.pos.y - r <= 6) out.add(2)
    if (s.board.height - m.pos.y - r <= 6) out.add(3)
  }
  return [...out]
}

const nearCentre = (s: GameState, u: UnitState, range: number) => alive(u).some((m) => dist(m.pos, centre(s)) - radiusOf(m) <= range)

// ---------------------------------------------------------------- what this turn destroyed

function killsThisTurn(s: GameState, victim: PlayerId) {
  const deadUnits = new Set(s.turnStart?.deadUnits ?? [])
  const deadModels = new Set(s.turnStart?.deadModels ?? [])
  const onObj = new Set(s.turnStart?.onObjective ?? [])
  const units = s.units.filter((u) => u.owner === victim && isDestroyed(u) && !deadUnits.has(u.id))
  const models = s.units.filter((u) => u.owner === victim).flatMap((u) => u.models.filter((m) => m.destroyed && !deadModels.has(m.id)))
  return {
    units: units.length,
    fromObjectives: units.filter((u) => onObj.has(u.id)).length,
    big: units.filter((u) => u.startingModels >= 13).length,
    giants: models.filter((m) => profileOf(m).w >= 10).length,
    characters: models.filter((m) => profileOf(m).character),
  }
}

// ---------------------------------------------------------------- scoring

/** VP a card is worth for `p` now (0 = not achieved), with a short reason. `mine`: it is p's turn. */
function cardValue(s: GameState, p: PlayerId, card: SecondaryId, fixed: boolean, mine: boolean): { vp: number; why: string } {
  const foe = other(s, p)
  const st = s.secondary![p]
  const none = { vp: 0, why: '' }
  switch (card) {
    case 'noPrisoners': {
      const k = killsThisTurn(s, foe).units
      return k ? { vp: Math.min(UP_TO, 2 * k), why: `уничтожено отрядов: ${k}` } : none
    }
    case 'overwhelmingForce': {
      const k = killsThisTurn(s, foe).fromObjectives
      return k ? { vp: Math.min(UP_TO, 3 * k), why: `уничтожено отрядов у целей: ${k}` } : none
    }
    case 'grievousBlow': {
      const k = killsThisTurn(s, foe).big
      return k ? { vp: fixed ? 4 * k : Math.min(UP_TO, 5 * k), why: `уничтожено отрядов из 13+ моделей: ${k}` } : none
    }
    case 'bringItDown': {
      const k = killsThisTurn(s, foe).giants
      return k ? { vp: fixed ? 4 * k : Math.min(UP_TO, 5 * k), why: `уничтожено моделей с 10+ ранами: ${k}` } : none
    }
    case 'assassination': {
      const chars = killsThisTurn(s, foe).characters
      if (fixed) {
        const vp = chars.reduce((a, m) => a + 3 + (profileOf(m).w >= 4 ? 1 : 0), 0)
        return vp ? { vp, why: `убито персонажей: ${chars.length}` } : none
      }
      const allDead = !s.units.some((u) => u.owner === foe && alive(u).some((m) => profileOf(m).character))
      return chars.length || allDead ? { vp: 5, why: chars.length ? `убит персонаж (${chars.length})` : 'все персонажи противника мертвы' } : none
    }
    case 'displayOfMight': {
      const a = eligible(s, p).filter((u) => inNoMansLand(s, u)).length
      const b = eligible(s, foe).filter((u) => inNoMansLand(s, u)).length
      return a > b ? { vp: mine ? 2 : 5, why: `в нейтральной зоне ${a} отр. против ${b}` } : none
    }
    case 'outflank': {
      const units = eligible(s, p).map((u) => ({ u, edges: edgesNear(s, u), out: !touches(u, territoryOf(s, p)) })).filter((x) => x.edges.length)
      const opposite = ([[0, 1], [2, 3]] as const).some(([e1, e2]) => {
        const a = units.filter((x) => x.edges.includes(e1)), b = units.filter((x) => x.edges.includes(e2))
        return a.some((x) => b.some((y) => y.u.id !== x.u.id && (x.out || y.out)))
      })
      if (opposite) return { vp: 5, why: 'отряды у противоположных краёв поля' }
      return units.some((x) => x.out) ? { vp: 3, why: 'отряд у края поля вне своей территории' } : none
    }
    case 'beacon': {
      const u = s.units.find((x) => x.id === st.beacon)
      if (!u || isDestroyed(u)) return none
      if (!touches(u, territoryOf(s, p))) return { vp: 5, why: `маяк «${u.name}» вне своей территории` }
      if (!touches(u, zoneOf(s, p))) return { vp: 3, why: `маяк «${u.name}» вне своей зоны расстановки` }
      return none
    }
    case 'defendStronghold': {
      if (s.round < 2) return none
      const home = s.objectives.some((o) => isHomeOf(o, p) && o.controller === p)
      if (!home) return none
      const clear = !unitsOf(s, foe).some((u) => touches(u, zoneOf(s, p)))
      return { vp: clear ? 5 : 3, why: clear ? 'домашняя цель удержана, врагов в зоне нет' : 'домашняя цель удержана' }
    }
    case 'engageAllFronts': {
      const qs = new Set(eligible(s, p).map((u) => quarterOf(s, u)).filter((q) => q !== null))
      if (qs.size >= 4) return { vp: fixed ? 4 : 5, why: 'отряды во всех четырёх четвертях' }
      if (qs.size === 3) return { vp: fixed ? 2 : 3, why: 'отряды в трёх четвертях' }
      return none
    }
    case 'secureNoMansLand': {
      const n = s.objectives.filter((o) => o.controller === p && !isHomeOf(o, p) && o.role !== 'home' && objInNoMansLand(s, o)).length
      return n >= 2 ? { vp: 5, why: `удержано целей в нейтральной зоне: ${n}` } : none
    }
    case 'forwardPosition': {
      const home = s.objectives.some((o) => isHomeOf(o, foe) && o.controller === p)
      const exp = s.objectives.filter((o) => o.role === 'expansion')
      const flanks = exp.length > 0 && exp.every((o) => o.controller === p)
      return home || flanks ? { vp: 5, why: home ? 'удержана домашняя цель противника' : 'удержаны обе фланговые цели' } : none
    }
    case 'centreGround': {
      const mineNear = eligible(s, p).some((u) => nearCentre(s, u, 3))
      if (!mineNear) return none
      if (!unitsOf(s, foe).some((u) => nearCentre(s, u, 6))) return { vp: 5, why: 'центр наш, врагов нет и в 6″' }
      if (!unitsOf(s, foe).some((u) => nearCentre(s, u, 3))) return { vp: 3, why: 'центр наш' }
      return none
    }
    case 'temptingTarget': {
      const o = s.objectives.find((x) => x.id === st.tempting)
      return o && o.controller === p ? { vp: 5, why: `удержана цель Ц${s.objectives.indexOf(o) + 1}` } : none
    }
    case 'behindEnemyLines': {
      const n = eligible(s, p).filter((u) => whollyIn(u, zoneOf(s, foe))).length
      return n ? { vp: Math.min(UP_TO, 3 * n), why: `отрядов в зоне расстановки противника: ${n}` } : none
    }
    case 'burdenOfTrust': {
      const g = Object.entries(st.guarded ?? {}).filter(([oid, uid]) => {
        const o = s.objectives.find((x) => x.id === oid), u = s.units.find((x) => x.id === uid)
        return o && u && !isDestroyed(u) && o.controller === p && unitNearObjective(u, o)
      }).length
      return g ? { vp: Math.min(UP_TO, 2 * g), why: `охрана удержала целей: ${g}` } : none
    }
  }
}

/** Add secondary VP within the caps (45 per battle, 15 per round, 20 per Fixed card). Returns what was scored. */
function scoreSecondary(s: GameState, p: PlayerId, card: SecondaryId, vp: number, why: string): number {
  const st = s.secondary![p]
  let got = Math.min(vp, SECONDARY_CAP - secondaryTotal(st), SECONDARY_ROUND_CAP - st.byRound[s.round])
  if (st.mode === 'fixed') got = Math.min(got, FIXED_CARD_CAP - (st.cardVp[card] ?? 0))
  got = Math.max(0, got)
  st.byRound[s.round] += got
  st.cardVp[card] = (st.cardVp[card] ?? 0) + got
  s.players[p].vp += got
  const capped = got < vp ? ` (лимит: засчитано ${got} из ${vp})` : ''
  addLog(s, `${FACTION_NAME[p]}: +${got} ПО — вторичная «${SECONDARY[card].name}»: ${why}${capped}.`, 'minimal')
  return got
}

/** The last turn of the battle (round 5, second player). */
const lastTurn = (s: GameState) => s.round >= s.maxRounds && s.activePlayer !== s.firstPlayer

/** Is this card checked at the end of the current turn, for its owner `p`? */
function checkedNow(s: GameState, p: PlayerId, card: SecondaryId): boolean {
  const when = SECONDARY[card].when
  const mine = s.activePlayer === p
  if (when === 'any' || when === 'both') return true
  if (when === 'yours') return mine
  return !mine || lastTurn(s)
}

/** End of a turn: every active card is checked, the active player first; achieved Tactical cards are put away. Then
 * the active player's cards marked for discarding go, for 1 CP each. Objective control must be up to date. */
export function secondaryTurnEnd(s: GameState) {
  if (!s.secondary) return
  const order = [s.activePlayer, other(s, s.activePlayer)]
  for (const p of order) {
    const st = s.secondary[p]
    for (const card of [...st.active]) {
      if (!checkedNow(s, p, card)) continue
      const { vp, why } = cardValue(s, p, card, st.mode === 'fixed', s.activePlayer === p)
      if (vp <= 0) continue
      const got = scoreSecondary(s, p, card, vp, why)
      if (st.mode === 'tactical') {
        st.active = st.active.filter((c) => c !== card)
        st.toDiscard = st.toDiscard.filter((c) => c !== card)
        st.achieved.push({ card, vp: got, round: s.round })
      }
    }
  }
  const st = s.secondary[s.activePlayer]
  st.age ??= {}
  for (const card of st.active) st.age[card] = (st.age[card] ?? 0) + 1
  for (const card of st.toDiscard) {
    if (!st.active.includes(card)) continue
    st.active = st.active.filter((c) => c !== card)
    st.discarded.push(card)
    s.players[s.activePlayer].cp++
    addLog(s, `${FACTION_NAME[s.activePlayer]}: вторичная «${SECONDARY[card].name}» сброшена — +1 CP.`, 'minimal')
  }
  st.toDiscard = []
}

// ---------------------------------------------------------------- drawing

/** The beacon: the fastest unit that is not a lone character. */
function pickBeacon(s: GameState, p: PlayerId): string | undefined {
  const us = unitsOf(s, p)
  const speed = (u: UnitState) => Math.min(...alive(u).map((m) => profileOf(m).m)) - (alive(u).every((m) => profileOf(m).character) ? 0.5 : 0)
  return [...us].sort((a, b) => speed(b) - speed(a))[0]?.id
}

/** A Tempting Target: the opponent picks the No Man's Land objective (not a home) farthest from the drawing player's zone. */
function pickTempting(s: GameState, p: PlayerId): string | undefined {
  const zone = zoneOf(s, p)
  const c = zone.reduce((a, v) => ({ x: a.x + v.x / zone.length, y: a.y + v.y / zone.length }), { x: 0, y: 0 })
  const opts = s.objectives.filter((o) => o.role !== 'home' && objInNoMansLand(s, o))
  return [...opts].sort((a, b) => dist(b.pos, c) - dist(a.pos, c))[0]?.id
}

/** Burden of Trust: each objective the player controls is guarded by one of its units in range. */
function assignGuards(s: GameState, p: PlayerId) {
  const st = s.secondary![p]
  st.guarded = {}
  for (const o of s.objectives) {
    if (o.controller !== p) continue
    const u = unitsOf(s, p).find((x) => unitNearObjective(x, o) && !Object.values(st.guarded!).includes(x.id))
    if (u) st.guarded[o.id] = u.id
  }
}

/** Why a freshly drawn card goes back (or is discarded) at once, or null to keep it. */
function redrawReason(s: GameState, p: PlayerId, card: SecondaryId): { why: string; back: boolean } | null {
  const foe = other(s, p)
  if (s.round === 1 && (card === 'defendStronghold' || card === 'forwardPosition' || card === 'behindEnemyLines')) return { why: 'в 1-м раунде её не выполнить', back: true }
  if (card === 'grievousBlow' && !unitsOf(s, foe).some((u) => u.startingModels >= 13)) return { why: 'у противника нет отрядов из 13+ моделей', back: false }
  if (card === 'bringItDown' && !unitsOf(s, foe).some((u) => alive(u).some((m) => profileOf(m).w >= 10))) return { why: 'у противника нет моделей с 10+ ранами', back: false }
  if (card === 'temptingTarget' && !pickTempting(s, p)) return { why: 'нет подходящей цели в нейтральной зоне', back: false }
  return null
}

/** Draw one card for `p` (Tactical), handling its "when drawn" text. */
function drawOne(s: GameState, p: PlayerId): SecondaryId | null {
  const st = s.secondary![p]
  for (let guard = 0; guard < SECONDARY_IDS.length * 2 && st.deck.length; guard++) {
    const card = st.deck.shift()!
    const redo = redrawReason(s, p, card)
    if (redo) {
      if (redo.back) st.deck.push(card)
      else st.discarded.push(card)
      addLog(s, `${FACTION_NAME[p]}: вытянута «${SECONDARY[card].name}» — ${redo.why}, берётся другая.`, 'standard')
      continue
    }
    st.active.push(card)
    if (card === 'beacon') st.beacon = pickBeacon(s, p)
    if (card === 'temptingTarget') st.tempting = pickTempting(s, p)
    if (card === 'burdenOfTrust') assignGuards(s, p)
    const extra = card === 'beacon' && st.beacon ? ` Маяк — «${s.units.find((u) => u.id === st.beacon)?.name}».`
      : card === 'temptingTarget' && st.tempting ? ` Противник выбрал цель Ц${s.objectives.findIndex((o) => o.id === st.tempting) + 1}.` : ''
    addLog(s, `${FACTION_NAME[p]}: новая вторичная — «${SECONDARY[card].name}» (${SECONDARY[card].nameEn}).${extra}`, 'minimal')
    return card
  }
  return null
}

/** Start of the active player's Command phase: Tactical players draw up to two cards; Burden of Trust picks guards. */
export function secondaryCommandStart(s: GameState) {
  if (!s.secondary) return
  const p = s.activePlayer
  const st = s.secondary[p]
  if (st.active.includes('burdenOfTrust')) assignGuards(s, p)
  if (st.mode !== 'tactical') return
  while (st.active.length < 2 && st.deck.length) if (!drawOne(s, p)) break
}

// ---------------------------------------------------------------- the player's choices

/** Why this secondary command is not allowed now, or null. */
export function secondaryProblem(s: GameState, p: PlayerId, op: 'swap' | 'discard', card: SecondaryId): string | null {
  const st = s.secondary?.[p]
  if (!st) return 'В этой битве нет вторичных миссий.'
  if (st.mode !== 'tactical') return 'Фиксированные вторичные не сбрасываются.'
  if (s.activePlayer !== p) return 'Только в свой ход.'
  if (!st.active.includes(card)) return 'Этой карты нет среди активных.'
  if (op === 'swap') {
    if (s.phase !== 'command') return 'Сменить карту можно в своей фазе командования.'
    if (st.swapUsed) return 'Смена за 1 CP уже использована в этой битве.'
    if (s.players[p].cp < 1) return 'Нужно 1 CP.'
    if (!st.deck.length) return 'Колода пуста.'
  }
  return null
}

export function applySecondary(s: GameState, p: PlayerId, op: 'swap' | 'discard', card: SecondaryId) {
  const st = s.secondary![p]
  if (op === 'discard') {
    const on = st.toDiscard.includes(card)
    st.toDiscard = on ? st.toDiscard.filter((c) => c !== card) : [...st.toDiscard, card]
    addLog(s, on ? `«${SECONDARY[card].name}»: сброс отменён.` : `«${SECONDARY[card].name}» будет сброшена в конце хода (после подсчёта) за +1 CP.`, 'standard')
    return
  }
  s.players[p].cp--
  st.swapUsed = true
  st.active = st.active.filter((c) => c !== card)
  st.toDiscard = st.toDiscard.filter((c) => c !== card)
  st.discarded.push(card)
  addLog(s, `${FACTION_NAME[p]}: вторичная «${SECONDARY[card].name}» сменена за 1 CP.`, 'minimal')
  drawOne(s, p)
}

// ---------------------------------------------------------------- for the AI

/** Points worth moving towards for the active cards of `p`, with a weight (AI movement). */
export function secondaryGoals(s: GameState, p: PlayerId): { pos: Vec; weight: number; label: string }[] {
  const st = s.secondary?.[p]
  if (!st) return []
  const out: { pos: Vec; weight: number; label: string }[] = []
  const foe = other(s, p)
  const zone = zoneOf(s, foe)
  const zc = zone.length ? zone.reduce((a, v) => ({ x: a.x + v.x / zone.length, y: a.y + v.y / zone.length }), { x: 0, y: 0 }) : null
  for (const card of st.active) {
    if (card === 'centreGround') out.push({ pos: centre(s), weight: 1, label: 'к центру поля (вторичная)' })
    if (card === 'behindEnemyLines' && zc) out.push({ pos: zc, weight: 0.8, label: 'в тыл врага (вторичная)' })
    if (card === 'temptingTarget' && st.tempting) {
      const o = s.objectives.find((x) => x.id === st.tempting)
      if (o) out.push({ pos: o.pos, weight: 1, label: 'к соблазнительной цели (вторичная)' })
    }
    if (card === 'forwardPosition') for (const o of s.objectives) if (isHomeOf(o, foe) || o.role === 'expansion') out.push({ pos: o.pos, weight: 0.6, label: 'к передовой позиции (вторичная)' })
    if (card === 'secureNoMansLand') for (const o of s.objectives) if (o.role !== 'home' && objInNoMansLand(s, o)) out.push({ pos: o.pos, weight: 0.6, label: 'к цели в нейтральной зоне (вторичная)' })
  }
  return out
}

/** The AI marks for discarding the Tactical cards it is unlikely to score: active for two of its turns already. */
export function aiDiscards(s: GameState, p: PlayerId): SecondaryId[] {
  const st = s.secondary?.[p]
  if (!st || st.mode !== 'tactical') return []
  return st.active.filter((c) => !st.toDiscard.includes(c) && cardValue(s, p, c, false, true).vp === 0 && (st.age?.[c] ?? 0) >= 2)
}

// ---------------------------------------------------------------- for the turn plan (missionAdvice.ts)

const WHEN_TEXT: Record<When, string> = {
  any: 'в конце любого хода',
  yours: 'в конце вашего хода',
  theirs: 'в конце хода противника',
  both: 'в конце вашего хода (2 ПО) или хода противника (5 ПО)',
}

const objName = (s: GameState, o: Objective) => `Ц${s.objectives.indexOf(o) + 1}`
const names = (us: UnitState[]) => us.map((u) => `«${u.name}»`).join(', ')

/** What a card asks for right now, in words, with the targets named. */
function cardNeed(s: GameState, p: PlayerId, card: SecondaryId): string {
  const foe = other(s, p)
  const st = s.secondary![p]
  const enemies = unitsOf(s, foe)
  switch (card) {
    case 'noPrisoners': return 'уничтожьте вражеский отряд — 2 ПО за каждый (до 5)'
    case 'overwhelmingForce': {
      const on = enemies.filter((u) => (s.turnStart?.onObjective ?? []).includes(u.id))
      return on.length ? `уничтожьте отряд, начавший ход у цели: ${names(on)}` : 'уничтожьте вражеский отряд, который начал ход у цели'
    }
    case 'displayOfMight': {
      const a = eligible(s, p).filter((u) => inNoMansLand(s, u)).length, b = eligible(s, foe).filter((u) => inNoMansLand(s, u)).length
      return `держите в нейтральной зоне больше отрядов, чем враг (сейчас ${a} против ${b})`
    }
    case 'outflank': return 'поставьте отряд в 6″ от края поля вне своей половины; два отряда у противоположных краёв — 5 ПО'
    case 'beacon': {
      const u = s.units.find((x) => x.id === st.beacon)
      return u && !isDestroyed(u) ? `выведите маяк «${u.name}» из своей зоны (3 ПО) или со своей половины поля (5 ПО) и сохраните его до конца хода противника` : 'маяк погиб — карту не выполнить, её стоит сбросить за 1 CP'
    }
    case 'grievousBlow': {
      const big = enemies.filter((u) => u.startingModels >= 13)
      return big.length ? `уничтожьте отряд из 13+ моделей: ${names(big)}` : 'у противника не осталось отрядов из 13+ моделей — карту стоит сбросить'
    }
    case 'defendStronghold': {
      const home = s.objectives.find((o) => isHomeOf(o, p))
      return `держите свою домашнюю цель${home ? ` ${objName(s, home)}` : ''} и не пускайте врагов в свою зону расстановки${s.round < 2 ? ' (со 2-го раунда)' : ''}`
    }
    case 'engageAllFronts': {
      const qs = new Set(eligible(s, p).map((u) => quarterOf(s, u)).filter((q) => q !== null)).size
      return `отряды целиком в трёх или четырёх четвертях поля, дальше 6″ от центра (сейчас четвертей: ${qs})`
    }
    case 'secureNoMansLand': {
      const nml = s.objectives.filter((o) => o.role !== 'home' && objInNoMansLand(s, o))
      return `держите две цели в нейтральной зоне: ${nml.map((o) => objName(s, o)).join(', ')} (сейчас ваших: ${nml.filter((o) => o.controller === p).length})`
    }
    case 'forwardPosition': {
      const home = s.objectives.find((o) => isHomeOf(o, foe))
      const exp = s.objectives.filter((o) => o.role === 'expansion')
      return `возьмите домашнюю цель противника${home ? ` ${objName(s, home)}` : ''} или обе фланговые: ${exp.map((o) => objName(s, o)).join(', ')}`
    }
    case 'centreGround': return 'отряд в 3″ от центра поля, а врагов там нет (если нет и в 6″ — 5 ПО)'
    case 'assassination': {
      const chars = enemies.filter((u) => alive(u).some((m) => profileOf(m).character))
      return chars.length ? `убейте вражеского персонажа: ${names(chars)}` : 'все персонажи противника убиты'
    }
    case 'temptingTarget': {
      const o = s.objectives.find((x) => x.id === st.tempting)
      return o ? `держите цель ${objName(s, o)}` : 'цели нет'
    }
    case 'behindEnemyLines': return 'отряд целиком в зоне расстановки противника — 3 ПО (до 5)'
    case 'bringItDown': {
      const giants = enemies.filter((u) => alive(u).some((m) => profileOf(m).w >= 10))
      return giants.length ? `уничтожьте модель с 10+ ранами: ${names(giants)}` : 'у противника не осталось моделей с 10+ ранами — карту стоит сбросить'
    }
    case 'burdenOfTrust': {
      const g = Object.keys(st.guarded ?? {}).map((id) => s.objectives.find((o) => o.id === id)).filter((o): o is Objective => !!o)
      return g.length ? `удержите охраняемые цели до конца хода противника: ${g.map((o) => objName(s, o)).join(', ')}` : 'возьмите цели: в начале вашего хода отряды у ваших целей станут охраной'
    }
  }
}

export interface CardOutlook {
  card: SecondaryId
  /** VP the card would give at its scoring moment if the board stayed as it is (0 = not met) */
  vp: number
  why: string
  when: string
  need: string
}

/** Each active card of `p`: would it score with the board as it is, when, and what it asks for. */
export function cardOutlooks(s: GameState, p: PlayerId): CardOutlook[] {
  const st = s.secondary?.[p]
  if (!st) return []
  const fixed = st.mode === 'fixed'
  return st.active.map((card) => {
    const when = SECONDARY[card].when
    // the moment it is checked: your own turn for 'yours' (and the 2 VP side of Display of Might), the opponent's otherwise
    const mine = when === 'yours' || when === 'both' || (when === 'any' && s.activePlayer === p)
    const { vp, why } = cardValue(s, p, card, fixed, mine)
    return { card, vp, why, when: WHEN_TEXT[when], need: cardNeed(s, p, card) }
  })
}
