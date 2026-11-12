import { tr } from '../../i18n/index'
import type { CombatDoctrine, HyperAdaptation, PlayerId } from '../types'

// Detachment rules: the one rule each army's detachment gives the whole army (11th edition, Wahapedia), next to its
// Stratagems (rules/stratagems.ts, DETACHMENT). Effects live in the engine; this module holds the texts and limits.

export interface DetachmentRule {
  name: string
  nameEn: string
  /** what it does here, in plain words */
  text: string
  /** where the game simplifies the tabletop rule, if anywhere */
  note?: string
}

export const DETACHMENT_RULE: Record<PlayerId, DetachmentRule> = {
  marines: {
    name: tr('Codex Discipline'), nameEn: 'Codex Discipline',
    text: tr('Combat Doctrines (army rule): at the start of your Command phase you can choose one doctrine for the whole army until the next Command phase — “Assault” (can charge after Advancing), “Devastator” (ranged weapons get Assault), “Tactical” (can shoot and charge after Falling Back). Each doctrine once per battle; the detachment lets you choose one of them one more time.'),
  },
  orks: {
    name: tr('Get Stuck In'), nameEn: 'Get Stuck In',
    text: tr('Melee attacks of all Ork units get Sustained Hits 1: every 6 to hit scores one extra hit.'),
  },
  tyranids: {
    name: tr('Hyper-adaptations'), nameEn: 'Hyper-adaptations',
    text: tr('At the start of the battle choose one hyper-adaptation for all Tyranids: “Swarming Instincts” (attacks against infantry and swarms — Sustained Hits 1), “Hyper-aggression” (attacks against monsters and vehicles — Lethal Hits) or “Hive Predators” (critical hits against characters — Precision).'),
  },
  necrons: {
    name: tr('Command Protocols'), nameEn: 'Command Protocols',
    text: tr('While a unit is led by a Necron character, all attacks by the unit’s models get +1 to the hit roll.'),
  },
  aeldari: {
    name: tr('Martial Grace'), nameEn: 'Martial Grace',
    text: tr('At the start of each round — one more Battle Focus token, and “Swift as the Wind” gives +1″ more movement.'),
    note: tr('The third part of the rule (+1 to the D6 roll of manoeuvres) does not work here: the game has no such manoeuvres yet.'),
  },
  adeptus_mechanicus: {
    name: tr('Rad-bombardment'), nameEn: 'Rad-bombardment',
    text: tr('At the start of the battle — a bombardment of the enemy deployment zone: each enemy unit there either goes to ground (Battle-shock; on a 5+ — D3 mortal wounds) or holds (on a 3+ — D3 mortal wounds). In rounds 2–5, at the start of your Command phase — “fallout”: each enemy unit in its deployment zone takes 1 mortal wound on a 3+ and takes a Battle-shock test.'),
    note: tr('Going to ground or holding is decided by the game for the unit’s owner: a unit that D3 mortal wounds could wipe out (3 wounds or fewer) goes to ground, the rest hold.'),
  },
}

export const DOCTRINE_NAME: Record<CombatDoctrine, string> = { assault: tr('Assault|doctrine'), devastator: tr('Devastator|doctrine'), tactical: tr('Tactical|doctrine') }
export const DOCTRINE_TEXT: Record<CombatDoctrine, string> = {
  assault: tr('after Advancing, a charge can be declared'),
  devastator: tr('ranged weapons get Assault: the unit shoots even after Advancing'),
  tactical: tr('after Falling Back, the unit can shoot and charge'),
}
export const DOCTRINES: CombatDoctrine[] = ['assault', 'devastator', 'tactical']
/** Codex Discipline (Gladius Task Force): one doctrine may be selected one more time per battle */
export const EXTRA_DOCTRINE_PICKS = 1

/** Can this doctrine still be selected, given the ones used so far (each once, plus `extra` repeats: Codex Discipline)? */
export function doctrineLeft(used: CombatDoctrine[], d: CombatDoctrine, extra = EXTRA_DOCTRINE_PICKS): boolean {
  const times = used.filter((x) => x === d).length
  const repeats = used.length - new Set(used).size
  return times === 0 || (times === 1 && repeats < extra)
}

export const HYPER_NAME: Record<HyperAdaptation, string> = { swarming: tr('Swarming Instincts'), aggression: tr('Hyper-aggression'), predators: tr('Hive Predators') }
export const HYPER_TEXT: Record<HyperAdaptation, string> = {
  swarming: tr('attacks against infantry and swarms (INFANTRY, SWARM) get Sustained Hits 1'),
  aggression: tr('attacks against monsters and vehicles (MONSTER, VEHICLE) get Lethal Hits'),
  predators: tr('critical hits against characters (CHARACTER) get Precision: wounds can be allocated to the character'),
}
export const HYPER_ADAPTATIONS: HyperAdaptation[] = ['swarming', 'aggression', 'predators']

/** Rad-bombardment: a unit with this many wounds or fewer could be wiped out by D3 mortal wounds, so it takes cover */
export const RAD_COVER_WOUNDS = 3
/** Martial Grace: the extra Battle Focus token per round and the extra inch of Swift as the Wind */
export const MARTIAL_GRACE_TOKENS = 1
export const MARTIAL_GRACE_SWIFT = 1
