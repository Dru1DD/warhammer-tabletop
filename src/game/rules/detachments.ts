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
    name: 'Дисциплина Кодекса', nameEn: 'Codex Discipline',
    text: 'Боевые доктрины (правило армии): в начале своей фазы командования можно выбрать одну доктрину для всей армии до следующей фазы командования — «Штурм» (после продвижения можно атаковать), «Опустошитель» (оружие дальнего боя получает Assault), «Тактика» (после отступления можно стрелять и атаковать). Каждую доктрину — раз за битву; детачмент разрешает выбрать одну из них ещё один раз.',
  },
  orks: {
    name: 'Ввяжись в драку', nameEn: 'Get Stuck In',
    text: 'Атаки ближнего боя всех отрядов Орков получают Sustained Hits 1: каждая шестёрка на попадание даёт ещё одно попадание.',
  },
  tyranids: {
    name: 'Гиперадаптации', nameEn: 'Hyper-adaptations',
    text: 'В начале битвы выберите одну гиперадаптацию для всех Тиранидов: «Роевые инстинкты» (атаки по пехоте и роям — Sustained Hits 1), «Гиперагрессия» (атаки по монстрам и технике — Lethal Hits) или «Хищники Улья» (критические попадания по персонажам — Precision).',
  },
  necrons: {
    name: 'Командные протоколы', nameEn: 'Command Protocols',
    text: 'Пока отряд ведёт персонаж Некронов, все атаки моделей отряда получают +1 к броску на попадание.',
  },
  aeldari: {
    name: 'Боевое изящество', nameEn: 'Martial Grace',
    text: 'В начале каждого раунда — ещё один жетон Боевого фокуса (Battle Focus), а «Быстрый, как ветер» (Swift as the Wind) даёт ещё +1″ к движению.',
    note: 'Третья часть правила (+1 к броску D6 манёвров) здесь не действует: таких манёвров в игре пока нет.',
  },
  adeptus_mechanicus: {
    name: 'Радиационная бомбардировка', nameEn: 'Rad-bombardment',
    text: 'В начале битвы — обстрел зоны расстановки противника: каждый его отряд там либо залегает (боевой шок; на 5+ — D3 смертельных ран), либо держится (на 3+ — D3 смертельных ран). Во 2–5 раундах, в начале вашей фазы командования, — «осадки»: каждый вражеский отряд в его зоне расстановки на 3+ получает 1 смертельную рану и проходит проверку боевого шока.',
    note: 'Залечь или держаться, решает игра за владельца отряда: залегает отряд, который D3 смертельных ран может уничтожить (3 раны и меньше), остальные держатся.',
  },
}

export const DOCTRINE_NAME: Record<CombatDoctrine, string> = { assault: 'Штурм', devastator: 'Опустошитель', tactical: 'Тактика' }
export const DOCTRINE_TEXT: Record<CombatDoctrine, string> = {
  assault: 'после продвижения (Advance) можно объявить атаку',
  devastator: 'оружие дальнего боя получает Assault: стреляет и после продвижения',
  tactical: 'после отступления (Fall Back) можно стрелять и атаковать',
}
export const DOCTRINES: CombatDoctrine[] = ['assault', 'devastator', 'tactical']
/** Codex Discipline (Gladius Task Force): one doctrine may be selected one more time per battle */
export const EXTRA_DOCTRINE_PICKS = 1

/** Can this doctrine still be selected, given the ones used so far (each once, plus EXTRA_DOCTRINE_PICKS repeats)? */
export function doctrineLeft(used: CombatDoctrine[], d: CombatDoctrine): boolean {
  const times = used.filter((x) => x === d).length
  const repeats = used.length - new Set(used).size
  return times === 0 || (times === 1 && repeats < EXTRA_DOCTRINE_PICKS)
}

export const HYPER_NAME: Record<HyperAdaptation, string> = { swarming: 'Роевые инстинкты', aggression: 'Гиперагрессия', predators: 'Хищники Улья' }
export const HYPER_TEXT: Record<HyperAdaptation, string> = {
  swarming: 'атаки по пехоте и роям (INFANTRY, SWARM) получают Sustained Hits 1',
  aggression: 'атаки по монстрам и технике (MONSTER, VEHICLE) получают Lethal Hits',
  predators: 'критические попадания по персонажам (CHARACTER) получают Precision: раны можно направить в персонажа',
}
export const HYPER_ADAPTATIONS: HyperAdaptation[] = ['swarming', 'aggression', 'predators']

/** Rad-bombardment: a unit with this many wounds or fewer could be wiped out by D3 mortal wounds, so it takes cover */
export const RAD_COVER_WOUNDS = 3
/** Martial Grace: the extra Battle Focus token per round and the extra inch of Swift as the Wind */
export const MARTIAL_GRACE_TOKENS = 1
export const MARTIAL_GRACE_SWIFT = 1
