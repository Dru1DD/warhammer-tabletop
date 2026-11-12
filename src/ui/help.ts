import type { AttackStep, ExplainLevel, GameState, Phase, PlayerId } from '../game/types'
import type { MeasurePoint } from '../store'
import { NATURAL_ROLL_NOTE } from '../game/combat/attack'
import { tr } from '../i18n/index'

// Short original explanations (not rulebook text). Shown according to the
// selected explanation level.

export const PHASE_HELP: Record<Phase, { short: string; long: string }> = {
  command: {
    short: tr('Get 1 CP. Units at half strength take a Battle-shock test.'),
    long: tr('At the start of the turn both players get 1 Command Point (CP). The active player’s units that lost half their models (or are already Battle-shocked) roll 2D6: if the result is at least Leadership (Ld), all is well, otherwise the unit becomes Battle-shocked (Battle-shock) — its OC becomes 0. Then objective points are scored. Orks can call WAAAGH! here (once per battle). Adeptus Mechanicus choose an Imperative here (Protector or Conqueror).'),
  },
  movement: {
    short: tr('Move the models no farther than M. No closer than 2″ to the enemy. The unit must stay coherent.'),
    long: tr('Pick your unit and drag the models (by default the whole unit moves; turn off “Move the whole unit” to place models one at a time). Each model can move no more than its M characteristic in a straight line. You cannot pass through enemy models, end a move in engagement range (engagement range, 2″) of the enemy or break coherency: each model within 2″ of another and within 9″ of all. An Advance adds D6″, but afterwards the unit cannot charge and only Assault weapons shoot. A unit in engagement range can only Fall Back — then it neither shoots nor charges this turn.'),
  },
  shooting: {
    short: tr('Choose a target: you need visibility and range. Rolls: hit → wound → save → damage.'),
    long: tr('Each model shoots its weapon if it sees at least one model of the target and the target is within range (measured from base edge to base edge). The sequence: a hit roll (BS), a wound roll (Strength against Toughness), the defender’s save (Sv, worsened by AP, or invulnerable), then damage (D). If the target is in cover (inside ruins/a crater or partly hidden by ruins), the shooter’s skill is 1 worse. A unit in engagement range can shoot only with Close-quarters weapons (pistols) at the unit it is engaged with.'),
  },
  charge: {
    short: tr('A unit within 12″ of an enemy can charge: 2D6 is the maximum distance.'),
    long: tr('Declare a charge with a unit that is within 12″ of an enemy and did not Advance or Fall Back this turn. Roll 2D6: this is the maximum move distance. Targets are enemies within that distance. The charging unit must end its move in engagement range (2″) of all targets and gets Fights First. A roll of 2 is never enough.'),
  },
  fight: {
    short: tr('Units in engagement range fight. Those that charged hit first, then in turns.'),
    long: tr('At the start of the phase all units in engagement range pile in up to 3″ toward the enemy. First the units with Fights First (those that charged) fight, then the rest, in turns starting with the active player. Models in engagement range (2″) of an enemy unit fight. After all fights units consolidate up to 3″.'),
  },
}

/** Beginner explanation of one recorded attack step (uses only what the engine recorded). */
export function explainStep(step: AttackStep): { text: string; result: string } {
  const n = step.dice.length
  const ok = step.dice.filter((d) => d.success).length
  switch (step.meta?.kind) {
    case 'hit':
      if (!n) return { text: step.note ?? tr('No hit roll is needed.'), result: '' }
      const extra = (step.note ?? '').split('; ').filter((x) => x && x !== NATURAL_ROLL_NOTE).join('; ')
      return {
        text: tr('The attacker rolls {n} dice — one for each attack. You need {target} or more: this is the weapon’s skill (BS/WS).{value} A 1 always misses, a 6 always hits.', { n, target: step.target, value: extra ? tr(' Taken into account: {extra}.', { extra }) : '' }),
        result: tr('Hits: {ok} of {n}.', { ok, n }),
      }
    case 'wound':
      if (!n) return { text: tr('No hits — nothing to wound with.'), result: step.meta?.auto && step.note ? step.note : '' }
      return {
        text: tr('One more die for each hit. The number needed depends on the weapon’s Strength against the target’s Toughness ({note}): Strength twice as high — 2+, higher — 3+, equal — 4+, lower — 5+, half — 6+. Here you need {target}.', { note: step.note, target: step.target }),
        result: tr('Wounds: {ok} of {n}.', { ok, n }),
      }
    case 'save':
      if (!n) return { text: tr('No wounds — the defender has nothing to ward off.'), result: '' }
      return {
        text: tr('Now the defender rolls — one die for each wound. {note}. A {target} or higher — the armour held.', { note: step.note, target: step.target }),
        result: tr('Warded off: {ok}, got through: {value}.', { ok, value: n - ok }),
      }
    case 'attacks':
      return { text: tr('This weapon has a random number of attacks ({target}): we roll a die for each shooting model{value}.', { target: step.target, value: step.target.startsWith('D3') ? tr(' (D3 is a D6 halved, rounded up)') : '' }), result: step.note ?? '' }
    case 'damage':
      if (n) return { text: tr('This weapon’s damage is random ({replace}): we roll a die for each unsaved wound.', { replace: step.target.replace('D', '') }), result: step.note ?? '' }
      return { text: tr('Each unsaved wound removes {replace} wounds from a model. When a model’s wounds run out, it dies.', { replace: step.target.replace('D', '') }), result: step.note ?? '' }
    default:
      return { text: step.note ?? '', result: '' }
  }
}

/** Plain-language meaning of datasheet columns (tooltips + glossary). */
export const STAT_HELP: { key: string; name: string; text: string }[] = [
  { key: 'M', name: tr('Move'), text: tr('How many inches a model can move in the Movement phase.') },
  { key: 'T', name: tr('Toughness'), text: tr('How durable a model is. The higher, the harder it is to wound: weapon Strength is compared with Toughness.') },
  { key: 'Sv', name: tr('Save|stat'), text: tr('Armour. When a model is wounded the defender rolls a die: this number or higher — the wound is warded off. 3+ is good armour, 5+ is weak.') },
  { key: 'W', name: tr('Wounds'), text: tr('How much damage a model can take before it dies.') },
  { key: 'Ld', name: tr('Leadership'), text: tr('Fortitude. A battered unit rolls 2D6: it needs this number or higher, otherwise — Battle-shock.') },
  { key: 'OC', name: tr('Objective Control'), text: tr('How much “weight” a model gives in the fight for an objective marker. Whoever has the greater OC sum near the objective controls it.') },
  { key: tr('Range'), name: tr('Range|alt'), text: tr('The maximum distance to the target in inches (from the base edge). “melee” — a melee weapon.') },
  { key: 'A', name: tr('Attacks|stat'), text: tr('How many hit dice one model rolls with this weapon.') },
  { key: 'BS/WS', name: tr('Skill (Ballistic/Weapon Skill)'), text: tr('What you need to roll on the die to hit. 3+ means 3, 4, 5 or 6.') },
  { key: 'S', name: tr('Strength'), text: tr('Compared with the target’s Toughness: the stronger the weapon, the easier it is to wound.') },
  { key: 'AP', name: tr('Armour Penetration'), text: tr('Worsens the target’s save: AP −1 turns 3+ armour into 4+.') },
  { key: 'D', name: tr('Damage|stat'), text: tr('How many wounds each unsaved attack removes.') },
]

/** Plain-language purpose of each phase: why it matters. */
export const PHASE_GOAL: Record<Phase, string> = {
  command: tr('Turn preparation: Command Points, Battle-shock tests, points for holding objectives.'),
  movement: tr('Take advantageous positions: closer to objectives, in cover or at shooting range.'),
  shooting: tr('Deal damage from afar before the enemy reaches your units.'),
  charge: tr('Charge into melee: the charging unit hits first.'),
  fight: tr('Units in engagement range trade blows in melee.'),
}

/** What happens when the player leaves this phase. */
export const PHASE_NEXT: Record<Phase, string> = {
  command: tr('movement: you will be able to rearrange your units.'),
  movement: tr('shooting. Unit positions will be locked.'),
  shooting: tr('charge: units near the enemy can dash into melee.'),
  charge: tr('fight: units in engagement range fight.'),
  fight: tr('The turn passes to the opponent.'),
}

/** Short role description per datasheet for the army introduction. */
export const UNIT_ROLE: Record<string, string> = {
  lieutenant: tr('A lone commander: tough, a good shot and a good fighter. Gives a nearby unit “precise strikes” (Lethal Hits).'),
  intercessors: tr('Core infantry: reliable 24″ bolt rifles. Strongest when standing still or on an objective.'),
  boyz: tr('An Ork mob: weak shooting but dangerous in melee. It strives to reach the enemy.'),
  assaultIntercessors: tr('Assault infantry: pistols and chainswords. Hits harder if it charged.'),
  redemptor: tr('Walking vehicle: very sturdy, powerful 36″ plasma and a crushing fist. It cannot pass through ruins and woods.'),
  deffDread: tr('Ork walking vehicle: klaws tear even armour, the flamer burns infantry at close range. It cannot pass through ruins and woods.'),
  hiveTyrant: tr('Swarm monster-commander: the source of Synapse, the Onslaught aura gives allies Assault and Lethal Hits, in melee it cuts with two weapons at once (Extra Attacks).'),
  termagants: tr('A cheap crowd of shooters: weak but numerous. Stay near Synapse — then they are more resistant to Battle-shock and hit harder.'),
  hormagaunts: tr('Fast runners (10″): can charge even after an Advance (Bounding Leap). They tear up weak infantry.'),
  tyranidWarriors: tr('Sturdy warrior-shooters with Synapse: after falling back they still shoot and charge. The venom cannon and barbed strangler hit groups.'),
  overlord: tr('A Necron lord: the tachyon arrow pierces almost anything once per battle, the blade with Devastating Wounds in melee; heals (Reanimation) and reduces damage to itself.'),
  necronWarriors: tr('Core Necron infantry: Gauss Flayer with Lethal Hits at 24″. Every turn some of the fallen return to the line (Reanimation Protocols).'),
  skorpekhDestroyers: tr('Fast heavy melee killers (8″, 3 wounds): re-roll misses, especially after a charge.'),
  scarabSwarms: tr('A flying swarm (10″, FLY): does not hold objectives (OC 0), but lowers the OC of a nearby enemy and explodes on contact (Self-destruction).'),
  farseer: tr('A fragile seer: Eldritch Storm over an area (Psychic), Guide gives the whole army +1 to hit against the chosen target.'),
  guardianDefenders: tr('Aeldari mass infantry: shuriken catapults and a heavy weapon platform (dies together with the unit). Fragile — keep your distance.'),
  direAvengers: tr('Elite shooters: catapults with 4 attacks, Sustained Hits 1 at point-blank range (Bladestorm). The Exarch carries a diresword.'),
  windriders: tr('Fast (14″) flying shooters (FLY): re-roll 1s when shooting, against the nearest target — re-roll any misses.'),
}

export type LearningStyle = 'guided' | 'assisted' | 'independent'

/** The three learning styles map onto the existing tutorial/explain settings. */
export const LEARNING_STYLE: Record<LearningStyle, { label: string; hint: string; settings: { tutorial: boolean; explain: ExplainLevel } }> = {
  guided: { label: tr('Step by step'), hint: tr('Lessons lead you through the first turn, detailed explanations.'), settings: { tutorial: true, explain: 'beginner' } },
  assisted: { label: tr('With hints'), hint: tr('You play yourself, hints and rules — as the game goes.'), settings: { tutorial: false, explain: 'beginner' } },
  independent: { label: tr('On your own'), hint: tr('Minimum text, rules on request.'), settings: { tutorial: false, explain: 'minimal' } },
}

export const learningStyleOf = (s: { tutorial: boolean; explain: ExplainLevel }): LearningStyle =>
  s.tutorial ? 'guided' : s.explain === 'minimal' ? 'independent' : 'assisted'

export interface LessonUi {
  selectedUnitId: string | null
  measure: { a: MeasurePoint | null; b: MeasurePoint | null }
  deploying: boolean
}

export interface Lesson {
  /** stable id: progress is stored by id, so lessons can be inserted/reordered */
  id: string
  title: string
  text: (human: PlayerId) => string
  /** `start` = game state when this lesson became current */
  done: (g: GameState, ui: LessonUi, human: PlayerId, start: TutorialStart) => boolean
}

export interface TutorialStart {
  round: number
  activePlayer: PlayerId
  diceCount: number
}

const myUnits = (g: GameState, p: PlayerId) => g.units.filter((u) => u.owner === p)

const FACTION_COLOR: Record<PlayerId, string> = { marines: tr('blue'), orks: tr('green'), tyranids: tr('pink-red'), necrons: tr('silver'), aeldari: tr('purple'), adeptus_mechanicus: tr('red-and-brass') }

export const LESSONS: Lesson[] = [
  {
    id: 'deploy',
    title: tr('Army placement'),
    text: () => tr('Before the battle place your units in the highlighted zone at your edge of the table. Drag a model (the whole unit moves) and press “✓ Place”. On the right — the list of units and what is left to do.'),
    done: (_g, ui) => !ui.deploying,
  },
  {
    id: 'units',
    title: tr('1. Meet the units'),
    text: (h) => tr('The green dashed frame — your unit ({item}) that can act now. Hover over any model to see its stats. Click an enemy model to pick its unit; the full card with stats is in the units panel on the left (the “»” button if the panel is collapsed).', { item: FACTION_COLOR[h] }),
    done: (g, ui, h) => g.units.some((u) => u.owner !== h && u.id === ui.selectedUnitId) || g.units.some((u) => u.owner === h && u.move !== 'none'),
  },
  {
    id: 'measure',
    title: tr('2. Measuring distance'),
    text: () => tr('Turn on the “📏 Ruler” (or press R) and click two models — the distance is counted from base edge to base edge. Esc — turn off.'),
    done: (_g, ui) => !!ui.measure.a && !!ui.measure.b,
  },
  {
    id: 'command',
    title: tr('3. The Command phase'),
    text: () => tr('The action bar is at the bottom of the field. Press “Next: Movement ▶”. (If it is the opponent’s turn now — wait, the AI plays on its own.)'),
    done: (g, _ui, h) => g.activePlayer === h && g.phase !== 'command',
  },
  {
    id: 'move',
    title: tr('4. Movement'),
    text: () => tr('Drag a model of the selected unit — by default the whole unit moves. The dashed circle is the movement limit, a hint at the top shows whether you can stand there. Press “✓ Confirm move” or Enter.'),
    done: (g, _ui, h) => g.units.some((u) => u.owner === h && u.move !== 'none') || (g.activePlayer === h && ['shooting', 'charge', 'fight'].includes(g.phase)),
  },
  {
    id: 'shoot',
    title: tr('5. Shooting'),
    text: () => tr('Press “Next: Shooting”. Enemies you can shoot are highlighted in green — just click them. In the “Dice” tab at the bottom you can see every roll and why it succeeded or not.'),
    done: (g, _ui, h, st) => myUnits(g, h).some((u) => u.shot) || g.diceLog.slice(st.diceCount).some((d) => d.player === h && d.steps.some((s) => s.meta?.kind === 'hit')),
  },
  {
    id: 'charge',
    title: tr('6. Charge and fight'),
    text: () => tr('If an enemy is within 12″, in the Charge phase press “🎲 Declare a charge”, then click a highlighted target. In the Fight phase click an enemy in engagement range. “Next” until the end of the turn passes the turn to the opponent.'),
    done: (g, _ui, h, st) => st.activePlayer === h && g.activePlayer !== h,
  },
  {
    id: 'enemy',
    title: tr('7. The opponent’s turn'),
    text: () => tr('The computer plays by the same rules. On the right, in “AI decisions”, you can see why it made its choice. Good luck! The goal is to score more VP over 5 rounds.'),
    done: (g, _ui, h, st) => (st.activePlayer !== h && g.activePlayer === h) || !!g.winner,
  },
]

const LEVEL_RANK: Record<ExplainLevel, number> = { minimal: 0, standard: 1, beginner: 2 }
export const showAt = (entry: ExplainLevel, setting: ExplainLevel) => LEVEL_RANK[entry] <= LEVEL_RANK[setting]
