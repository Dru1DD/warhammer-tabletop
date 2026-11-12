import { FACTION_NAME } from '../data/datasheets'
import { dist, pointInPolygon } from '../geometry/geometry'
import { addLog, alive, isDestroyed, other, profileOf, radiusOf, sidesOf, unitNearObjective, unitsOf } from '../gameState'
import { quote, tr } from '../../i18n/index'
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
  noPrisoners: { name: tr('No Prisoners'), nameEn: 'No Prisoners', when: 'any', text: tr('End of any turn: 2 VP for each enemy unit destroyed this turn (up to 5).') },
  overwhelmingForce: { name: tr('Overwhelming Force'), nameEn: 'Overwhelming Force', when: 'any', text: tr('End of any turn: 3 VP for each enemy unit that started the turn at an objective and was destroyed this turn (up to 5).') },
  displayOfMight: { name: tr('Display of Might'), nameEn: 'Display of Might', when: 'both', text: tr('If you have more units (not Battle-shocked) wholly within No Man’s Land than your opponent: 2 VP at the end of your turn or 5 VP at the end of your opponent’s turn.') },
  outflank: { name: tr('Outflank'), nameEn: 'Outflank', when: 'yours', text: tr('End of your turn: 3 VP if your unit is within 6″ of a board edge and outside your territory; 5 VP if you have a unit at each of two opposite edges and at least one is outside your territory.') },
  beacon: { name: tr('Beacon'), nameEn: 'Beacon', when: 'theirs', text: tr('When drawn: the game picks your beacon unit (the fastest). End of your opponent’s turn (or of round 5): 3 VP if the beacon is outside your deployment zone, 5 VP if it is outside your territory.') },
  grievousBlow: { name: tr('A Grievous Blow'), nameEn: 'A Grievous Blow', when: 'any', text: tr('End of any turn: 5 VP for each enemy unit of 13+ models destroyed this turn (up to 5). No such units — the card is swapped at once.'), fixedText: tr('End of any turn: 4 VP for each enemy unit of 13+ models destroyed this turn.') },
  defendStronghold: { name: tr('Defend Stronghold'), nameEn: 'Defend Stronghold', when: 'theirs', text: tr('From round 2, end of your opponent’s turn (or of round 5): 3 VP if you hold your home objective, and 2 more if there are no enemies in your deployment zone. In round 1 the card is swapped at once.') },
  engageAllFronts: { name: tr('Engage on All Fronts'), nameEn: 'Engage on All Fronts', when: 'yours', text: tr('End of your turn: units wholly within three table quarters (more than 6″ from the centre) — 3 VP, within four — 5 VP.'), fixedText: tr('End of your turn: three quarters of the board — 2 VP, four — 4 VP.') },
  secureNoMansLand: { name: tr('Secure No Man\'s Land'), nameEn: "Secure No Man's Land", when: 'yours', text: tr('End of your turn: 5 VP if you control two or more objectives in No Man’s Land (other than home ones).') },
  forwardPosition: { name: tr('Forward Position'), nameEn: 'Forward Position', when: 'yours', text: tr('End of your turn: 5 VP if you control the enemy’s home objective or both flank objectives. In round 1 the card is swapped at once.') },
  centreGround: { name: tr('Centre Ground'), nameEn: 'Centre Ground', when: 'yours', text: tr('End of your turn: 3 VP if your unit is within 3″ of the board centre and there are no enemies there; 5 VP if there are no enemies within 6″ either.') },
  assassination: { name: tr('Assassination'), nameEn: 'Assassination', when: 'any', text: tr('End of any turn: 5 VP if an enemy character was killed this turn or all of them are dead.'), fixedText: tr('End of any turn: 3 VP for each enemy character killed this turn, +1 VP if it has 4+ wounds.') },
  temptingTarget: { name: tr('A Tempting Target'), nameEn: 'A Tempting Target', when: 'yours', text: tr('When drawn: your opponent picks an objective in No Man’s Land (the game picks the one farthest from you). End of your turn: 5 VP if you control it.') },
  behindEnemyLines: { name: tr('Behind Enemy Lines'), nameEn: 'Behind Enemy Lines', when: 'yours', text: tr('End of your turn: 3 VP for each of your units wholly within the enemy deployment zone (up to 5). In round 1 the card is swapped at once.') },
  bringItDown: { name: tr('Bring It Down'), nameEn: 'Bring It Down', when: 'any', text: tr('End of any turn: 5 VP for each enemy model with 10+ wounds destroyed this turn (up to 5). No such models — the card is swapped at once.'), fixedText: tr('End of any turn: 4 VP for each enemy model with 10+ wounds destroyed this turn.') },
  burdenOfTrust: { name: tr('Burden of Trust'), nameEn: 'Burden of Trust', when: 'theirs', text: tr('When drawn and at the start of your turn: your units at your objectives take them under guard. End of your opponent’s turn (or of round 5): 2 VP for each objective the guard held (up to 5).') },
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
      return k ? { vp: Math.min(UP_TO, 2 * k), why: tr('units destroyed: {n}', { n: k }) } : none
    }
    case 'overwhelmingForce': {
      const k = killsThisTurn(s, foe).fromObjectives
      return k ? { vp: Math.min(UP_TO, 3 * k), why: tr('units destroyed at objectives: {n}', { n: k }) } : none
    }
    case 'grievousBlow': {
      const k = killsThisTurn(s, foe).big
      return k ? { vp: fixed ? 4 * k : Math.min(UP_TO, 5 * k), why: tr('units of 13+ models destroyed: {n}', { n: k }) } : none
    }
    case 'bringItDown': {
      const k = killsThisTurn(s, foe).giants
      return k ? { vp: fixed ? 4 * k : Math.min(UP_TO, 5 * k), why: tr('models with 10+ wounds destroyed: {n}', { n: k }) } : none
    }
    case 'assassination': {
      const chars = killsThisTurn(s, foe).characters
      if (fixed) {
        const vp = chars.reduce((a, m) => a + 3 + (profileOf(m).w >= 4 ? 1 : 0), 0)
        return vp ? { vp, why: tr('characters killed: {n}', { n: chars.length }) } : none
      }
      const allDead = !s.units.some((u) => u.owner === foe && alive(u).some((m) => profileOf(m).character))
      return chars.length || allDead ? { vp: 5, why: chars.length ? tr('a character killed ({n})', { n: chars.length }) : tr('all enemy characters are dead') } : none
    }
    case 'displayOfMight': {
      const a = eligible(s, p).filter((u) => inNoMansLand(s, u)).length
      const b = eligible(s, foe).filter((u) => inNoMansLand(s, u)).length
      return a > b ? { vp: mine ? 2 : 5, why: tr('{a} units in No Man’s Land against {b}', { a, b }) } : none
    }
    case 'outflank': {
      const units = eligible(s, p).map((u) => ({ u, edges: edgesNear(s, u), out: !touches(u, territoryOf(s, p)) })).filter((x) => x.edges.length)
      const opposite = ([[0, 1], [2, 3]] as const).some(([e1, e2]) => {
        const a = units.filter((x) => x.edges.includes(e1)), b = units.filter((x) => x.edges.includes(e2))
        return a.some((x) => b.some((y) => y.u.id !== x.u.id && (x.out || y.out)))
      })
      if (opposite) return { vp: 5, why: tr('units at opposite board edges') }
      return units.some((x) => x.out) ? { vp: 3, why: tr('a unit at a board edge outside your territory') } : none
    }
    case 'beacon': {
      const u = s.units.find((x) => x.id === st.beacon)
      if (!u || isDestroyed(u)) return none
      if (!touches(u, territoryOf(s, p))) return { vp: 5, why: tr('beacon “{name}” is outside your territory', { name: u.name }) }
      if (!touches(u, zoneOf(s, p))) return { vp: 3, why: tr('beacon “{name}” is outside your deployment zone', { name: u.name }) }
      return none
    }
    case 'defendStronghold': {
      if (s.round < 2) return none
      const home = s.objectives.some((o) => isHomeOf(o, p) && o.controller === p)
      if (!home) return none
      const clear = !unitsOf(s, foe).some((u) => touches(u, zoneOf(s, p)))
      return { vp: clear ? 5 : 3, why: clear ? tr('home objective held, no enemies in the zone') : tr('home objective held') }
    }
    case 'engageAllFronts': {
      const qs = new Set(eligible(s, p).map((u) => quarterOf(s, u)).filter((q) => q !== null))
      if (qs.size >= 4) return { vp: fixed ? 4 : 5, why: tr('units in all four quarters') }
      if (qs.size === 3) return { vp: fixed ? 2 : 3, why: tr('units in three quarters') }
      return none
    }
    case 'secureNoMansLand': {
      const n = s.objectives.filter((o) => o.controller === p && !isHomeOf(o, p) && o.role !== 'home' && objInNoMansLand(s, o)).length
      return n >= 2 ? { vp: 5, why: tr('objectives held in No Man’s Land: {n}', { n }) } : none
    }
    case 'forwardPosition': {
      const home = s.objectives.some((o) => isHomeOf(o, foe) && o.controller === p)
      const exp = s.objectives.filter((o) => o.role === 'expansion')
      const flanks = exp.length > 0 && exp.every((o) => o.controller === p)
      return home || flanks ? { vp: 5, why: home ? tr('held the enemy’s home objective') : tr('held both flank objectives') } : none
    }
    case 'centreGround': {
      const mineNear = eligible(s, p).some((u) => nearCentre(s, u, 3))
      if (!mineNear) return none
      if (!unitsOf(s, foe).some((u) => nearCentre(s, u, 6))) return { vp: 5, why: tr('the centre is ours, no enemies within 6″ either') }
      if (!unitsOf(s, foe).some((u) => nearCentre(s, u, 3))) return { vp: 3, why: tr('the centre is ours') }
      return none
    }
    case 'temptingTarget': {
      const o = s.objectives.find((x) => x.id === st.tempting)
      return o && o.controller === p ? { vp: 5, why: tr('held objective {obj}', { obj: tr('O{value}', { value: s.objectives.indexOf(o) + 1 }) }) } : none
    }
    case 'behindEnemyLines': {
      const n = eligible(s, p).filter((u) => whollyIn(u, zoneOf(s, foe))).length
      return n ? { vp: Math.min(UP_TO, 3 * n), why: tr('units in the enemy deployment zone: {n}', { n }) } : none
    }
    case 'burdenOfTrust': {
      const g = Object.entries(st.guarded ?? {}).filter(([oid, uid]) => {
        const o = s.objectives.find((x) => x.id === oid), u = s.units.find((x) => x.id === uid)
        return o && u && !isDestroyed(u) && o.controller === p && unitNearObjective(u, o)
      }).length
      return g ? { vp: Math.min(UP_TO, 2 * g), why: tr('the guard held objectives: {n}', { n: g }) } : none
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
  const capped = got < vp ? tr(' (cap: {got} of {vp} counted)', { got, vp }) : ''
  addLog(s, tr('{faction}: +{got} VP — secondary “{name}”: {why}{capped}.', { faction: FACTION_NAME[p], got, name: SECONDARY[card].name, why, capped }), 'minimal')
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
    addLog(s, tr('{faction}: secondary “{name}” discarded — +1 CP.', { faction: FACTION_NAME[s.activePlayer], name: SECONDARY[card].name }), 'minimal')
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
  if (s.round === 1 && (card === 'defendStronghold' || card === 'forwardPosition' || card === 'behindEnemyLines')) return { why: tr('it cannot be done in round 1'), back: true }
  if (card === 'grievousBlow' && !unitsOf(s, foe).some((u) => u.startingModels >= 13)) return { why: tr('the opponent has no units of 13+ models'), back: false }
  if (card === 'bringItDown' && !unitsOf(s, foe).some((u) => alive(u).some((m) => profileOf(m).w >= 10))) return { why: tr('the opponent has no models with 10+ wounds'), back: false }
  if (card === 'temptingTarget' && !pickTempting(s, p)) return { why: tr('there is no suitable objective in No Man’s Land'), back: false }
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
      addLog(s, tr('{faction}: drew “{name}” — {why}, another is taken.', { faction: FACTION_NAME[p], name: SECONDARY[card].name, why: redo.why }), 'standard')
      continue
    }
    st.active.push(card)
    if (card === 'beacon') st.beacon = pickBeacon(s, p)
    if (card === 'temptingTarget') st.tempting = pickTempting(s, p)
    if (card === 'burdenOfTrust') assignGuards(s, p)
    const extra = card === 'beacon' && st.beacon ? tr(' The beacon is “{name}”.', { name: s.units.find((u) => u.id === st.beacon)?.name })
      : card === 'temptingTarget' && st.tempting ? tr(' The opponent picked objective {obj}.', { obj: tr('O{value}', { value: s.objectives.findIndex((o) => o.id === st.tempting) + 1 }) }) : ''
    const { name, nameEn } = SECONDARY[card]
    addLog(s, name === nameEn ? tr('{faction}: new secondary — “{name}”.{extra}', { faction: FACTION_NAME[p], name, extra }) : tr('{faction}: new secondary — “{name}” ({nameEn}).{extra}', { faction: FACTION_NAME[p], name, nameEn, extra }), 'minimal')
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
  if (!st) return tr('There are no secondary missions in this battle.')
  if (st.mode !== 'tactical') return tr('Fixed secondaries are not discarded.')
  if (s.activePlayer !== p) return tr('Only in your own turn.')
  if (!st.active.includes(card)) return tr('This card is not among the active ones.')
  if (op === 'swap') {
    if (s.phase !== 'command') return tr('A card can be swapped in your Command phase.')
    if (st.swapUsed) return tr('The 1 CP swap has already been used in this battle.')
    if (s.players[p].cp < 1) return tr('You need 1 CP.')
    if (!st.deck.length) return tr('The deck is empty.')
  }
  return null
}

export function applySecondary(s: GameState, p: PlayerId, op: 'swap' | 'discard', card: SecondaryId) {
  const st = s.secondary![p]
  if (op === 'discard') {
    const on = st.toDiscard.includes(card)
    st.toDiscard = on ? st.toDiscard.filter((c) => c !== card) : [...st.toDiscard, card]
    addLog(s, on ? tr('“{name}”: discard cancelled.', { name: SECONDARY[card].name }) : tr('“{name}” will be discarded at the end of the turn (after scoring) for +1 CP.', { name: SECONDARY[card].name }), 'standard')
    return
  }
  s.players[p].cp--
  st.swapUsed = true
  st.active = st.active.filter((c) => c !== card)
  st.toDiscard = st.toDiscard.filter((c) => c !== card)
  st.discarded.push(card)
  addLog(s, tr('{faction}: secondary “{name}” swapped for 1 CP.', { faction: FACTION_NAME[p], name: SECONDARY[card].name }), 'minimal')
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
    if (card === 'centreGround') out.push({ pos: centre(s), weight: 1, label: tr('toward the centre of the board (secondary)') })
    if (card === 'behindEnemyLines' && zc) out.push({ pos: zc, weight: 0.8, label: tr('behind enemy lines (secondary)') })
    if (card === 'temptingTarget' && st.tempting) {
      const o = s.objectives.find((x) => x.id === st.tempting)
      if (o) out.push({ pos: o.pos, weight: 1, label: tr('toward the tempting target (secondary)') })
    }
    if (card === 'forwardPosition') for (const o of s.objectives) if (isHomeOf(o, foe) || o.role === 'expansion') out.push({ pos: o.pos, weight: 0.6, label: tr('toward the forward position (secondary)') })
    if (card === 'secureNoMansLand') for (const o of s.objectives) if (o.role !== 'home' && objInNoMansLand(s, o)) out.push({ pos: o.pos, weight: 0.6, label: tr('toward an objective in No Man’s Land (secondary)') })
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
  any: tr('at the end of any turn'),
  yours: tr('at the end of your turn'),
  theirs: tr('at the end of the opponent’s turn'),
  both: tr('at the end of your turn (2 VP) or the opponent’s turn (5 VP)'),
}

const objName = (s: GameState, o: Objective) => tr('O{value}', { value: s.objectives.indexOf(o) + 1 })
const names = (us: UnitState[]) => us.map((u) => quote(u.name)).join(', ')

/** What a card asks for right now, in words, with the targets named. */
function cardNeed(s: GameState, p: PlayerId, card: SecondaryId): string {
  const foe = other(s, p)
  const st = s.secondary![p]
  const enemies = unitsOf(s, foe)
  switch (card) {
    case 'noPrisoners': return tr('destroy an enemy unit — 2 VP for each (up to 5)')
    case 'overwhelmingForce': {
      const on = enemies.filter((u) => (s.turnStart?.onObjective ?? []).includes(u.id))
      return on.length ? tr('destroy a unit that started the turn at an objective: {names}', { names: names(on) }) : tr('destroy an enemy unit that started the turn at an objective')
    }
    case 'displayOfMight': {
      const a = eligible(s, p).filter((u) => inNoMansLand(s, u)).length, b = eligible(s, foe).filter((u) => inNoMansLand(s, u)).length
      return tr('keep more units in no man’s land than the enemy (now {a} vs {b})', { a, b })
    }
    case 'outflank': return tr('put a unit within 6″ of a board edge outside your half; two units at opposite edges — 5 VP')
    case 'beacon': {
      const u = s.units.find((x) => x.id === st.beacon)
      return u && !isDestroyed(u) ? tr('take the beacon “{name}” out of your zone (3 VP) or off your half of the board (5 VP) and keep it alive until the end of the opponent’s turn', { name: u.name }) : tr('the beacon is dead — the card cannot be completed, discard it for 1 CP')
    }
    case 'grievousBlow': {
      const big = enemies.filter((u) => u.startingModels >= 13)
      return big.length ? tr('destroy a unit of 13+ models: {names}', { names: names(big) }) : tr('the enemy has no units of 13+ models left — discard the card')
    }
    case 'defendStronghold': {
      const home = s.objectives.find((o) => isHomeOf(o, p))
      return s.round < 2
        ? tr('hold your home objective{obj} and keep enemies out of your deployment zone (from round 2)', { obj: home ? ` ${objName(s, home)}` : '' })
        : tr('hold your home objective{obj} and keep enemies out of your deployment zone', { obj: home ? ` ${objName(s, home)}` : '' })
    }
    case 'engageAllFronts': {
      const qs = new Set(eligible(s, p).map((u) => quarterOf(s, u)).filter((q) => q !== null)).size
      return tr('units wholly in three or four quarters of the board, more than 6″ from the centre (quarters now: {qs})', { qs })
    }
    case 'secureNoMansLand': {
      const nml = s.objectives.filter((o) => o.role !== 'home' && objInNoMansLand(s, o))
      return tr('hold two objectives in no man’s land: {list} (yours now: {mine})', { list: nml.map((o) => objName(s, o)).join(', '), mine: nml.filter((o) => o.controller === p).length })
    }
    case 'forwardPosition': {
      const home = s.objectives.find((o) => isHomeOf(o, foe))
      const exp = s.objectives.filter((o) => o.role === 'expansion')
      return tr('take the enemy’s home objective{obj} or both flank objectives: {list}', { obj: home ? ` ${objName(s, home)}` : '', list: exp.map((o) => objName(s, o)).join(', ') })
    }
    case 'centreGround': return tr('a unit within 3″ of the board centre with no enemies there (none within 6″ — 5 VP)')
    case 'assassination': {
      const chars = enemies.filter((u) => alive(u).some((m) => profileOf(m).character))
      return chars.length ? tr('kill an enemy character: {names}', { names: names(chars) }) : tr('all the enemy characters are dead')
    }
    case 'temptingTarget': {
      const o = s.objectives.find((x) => x.id === st.tempting)
      return o ? tr('hold objective {obj}', { obj: objName(s, o) }) : tr('there is no objective')
    }
    case 'behindEnemyLines': return tr('a unit wholly in the enemy deployment zone — 3 VP (up to 5)')
    case 'bringItDown': {
      const giants = enemies.filter((u) => alive(u).some((m) => profileOf(m).w >= 10))
      return giants.length ? tr('destroy a model with 10+ wounds: {names}', { names: names(giants) }) : tr('the enemy has no models with 10+ wounds left — discard the card')
    }
    case 'burdenOfTrust': {
      const g = Object.keys(st.guarded ?? {}).map((id) => s.objectives.find((o) => o.id === id)).filter((o): o is Objective => !!o)
      return g.length ? tr('hold the guarded objectives until the end of the opponent’s turn: {list}', { list: g.map((o) => objName(s, o)).join(', ') }) : tr('take objectives: at the start of your turn the units at your objectives become guards')
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
