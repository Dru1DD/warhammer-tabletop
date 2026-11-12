// Central asset manifest. Token art priority: the player's own uploaded photo
// → `image` set here (e.g. a file in /public/tokens/) → built-in original SVG
// portrait (src/assets/tokenArt.ts). No third-party art — see docs/assets.md.

import type { PlayerId, TerrainKind } from '../game/types'
import { BLUEPRINT_LINE, mechanicusEmblem, portraitFor, svgDataUrl } from './tokenArt'
import { VARIANT_FROM } from '../game/data/wargearExtra'

export interface TokenStyle {
  fill: string
  stroke: string
  text: string
  label: string
  image?: string
}

export const FACTION_STYLE: Record<PlayerId, { primary: string; secondary: string; accent: string }> = {
  marines: { primary: '#1f4e9c', secondary: '#c9d6ee', accent: '#e4b33a' },
  orks: { primary: '#3f7a2a', secondary: '#d7e5c3', accent: '#b83a2b' },
  tyranids: { primary: '#8c2f4a', secondary: '#f3c4cc', accent: '#ff7a8a' },
  necrons: { primary: '#3a4a52', secondary: '#dfe9ef', accent: '#47e08a' },
  aeldari: { primary: '#5a3f9c', secondary: '#ddd0f7', accent: '#f0c75e' },
  adeptus_mechanicus: { primary: '#8a1f1f', secondary: '#f1d9a6', accent: '#e0a63a' },
}

/** Original faction emblem for the army selection card (factions without one show only their unit portraits). */
export const FACTION_EMBLEM: Partial<Record<PlayerId, string>> = { adeptus_mechanicus: svgDataUrl(mechanicusEmblem()) }

export const TOKENS: Record<string, TokenStyle> = {
  lieutenant: { fill: '#1f4e9c', stroke: '#e4b33a', text: '#ffffff', label: 'Лт' },
  captain: { fill: '#1f4e9c', stroke: '#e4b33a', text: '#ffffff', label: 'Кп' },
  hellblasterSergeant: { fill: '#1f4e9c', stroke: '#c9d6ee', text: '#ffffff', label: 'СП' },
  hellblaster: { fill: '#2b5fb5', stroke: '#c9d6ee', text: '#ffffff', label: 'П' },
  infernusSergeant: { fill: '#1f4e9c', stroke: '#c9d6ee', text: '#ffffff', label: 'СО' },
  infernusMarine: { fill: '#2b5fb5', stroke: '#c9d6ee', text: '#ffffff', label: 'О' },
  bladeguardSergeant: { fill: '#1f4e9c', stroke: '#e4b33a', text: '#ffffff', label: 'СВ' },
  bladeguardVeteran: { fill: '#2b5fb5', stroke: '#e4b33a', text: '#ffffff', label: 'В' },
  intercessorSergeant: { fill: '#1f4e9c', stroke: '#c9d6ee', text: '#ffffff', label: 'Сж' },
  intercessor: { fill: '#2b5fb5', stroke: '#c9d6ee', text: '#ffffff', label: 'И' },
  intercessorGL: { fill: '#2b5fb5', stroke: '#c9d6ee', text: '#ffffff', label: 'Гр' },
  nob: { fill: '#3f7a2a', stroke: '#b83a2b', text: '#ffffff', label: 'Нб' },
  boy: { fill: '#4d8f33', stroke: '#d7e5c3', text: '#ffffff', label: 'Б' },
  boyBigShoota: { fill: '#4d8f33', stroke: '#d7e5c3', text: '#ffffff', label: 'БШ' },
  boyRokkit: { fill: '#4d8f33', stroke: '#d7e5c3', text: '#ffffff', label: 'Р' },
  assaultSergeant: { fill: '#1f4e9c', stroke: '#c9d6ee', text: '#ffffff', label: 'ШС' },
  assaultIntercessor: { fill: '#2b5fb5', stroke: '#c9d6ee', text: '#ffffff', label: 'Ш' },
  redemptor: { fill: '#1f4e9c', stroke: '#e4b33a', text: '#ffffff', label: 'Дрд' },
  deffDread: { fill: '#3f7a2a', stroke: '#b83a2b', text: '#ffffff', label: 'ДД' },
  warboss: { fill: '#3f7a2a', stroke: '#e4b33a', text: '#ffffff', label: 'ВБ' },
  nobzNob: { fill: '#3f7a2a', stroke: '#b83a2b', text: '#ffffff', label: 'Н' },
  gretchin: { fill: '#6a9a3a', stroke: '#d7e5c3', text: '#ffffff', label: 'Г' },
  kommandoNob: { fill: '#2f5a24', stroke: '#b83a2b', text: '#ffffff', label: 'КН' },
  kommando: { fill: '#3a6a2c', stroke: '#d7e5c3', text: '#ffffff', label: 'К' },
  // Tyranids
  hiveTyrant: { fill: '#8c2f4a', stroke: '#ff7a8a', text: '#ffffff', label: 'ТУ' },
  termagant: { fill: '#a33a58', stroke: '#f3c4cc', text: '#ffffff', label: 'Тр' },
  termagantShard: { fill: '#a33a58', stroke: '#f3c4cc', text: '#ffffff', label: 'ТО' },
  termagantSpike: { fill: '#a33a58', stroke: '#f3c4cc', text: '#ffffff', label: 'ТШ' },
  termagantWeb: { fill: '#a33a58', stroke: '#f3c4cc', text: '#ffffff', label: 'ТП' },
  hormagaunt: { fill: '#8c2f4a', stroke: '#f3c4cc', text: '#ffffff', label: 'Гм' },
  tyranidPrime: { fill: '#8c2f4a', stroke: '#ff7a8a', text: '#ffffff', label: 'Пр' },
  wingedPrime: { fill: '#8c2f4a', stroke: '#ff7a8a', text: '#ffffff', label: 'КП' },
  neurothrope: { fill: '#7a2a5a', stroke: '#ff7a8a', text: '#ffffff', label: 'Нт' },
  zoanthrope: { fill: '#7a2a5a', stroke: '#f3c4cc', text: '#ffffff', label: 'Зо' },
  carnifex: { fill: '#8c2f4a', stroke: '#ff7a8a', text: '#ffffff', label: 'Кф' },
  barbgaunt: { fill: '#a33a58', stroke: '#f3c4cc', text: '#ffffff', label: 'Бг' },
  tyranidWarrior: { fill: '#a33a58', stroke: '#f3c4cc', text: '#ffffff', label: 'Вн' },
  tyranidWarriorVenom: { fill: '#a33a58', stroke: '#f3c4cc', text: '#ffffff', label: 'ВЯ' },
  tyranidWarriorStrangler: { fill: '#a33a58', stroke: '#f3c4cc', text: '#ffffff', label: 'ВД' },
  // Necrons
  overlord: { fill: '#3a4a52', stroke: '#47e08a', text: '#ffffff', label: 'Ов' },
  necronWarrior: { fill: '#46585f', stroke: '#dfe9ef', text: '#ffffff', label: 'Нк' },
  royalWarden: { fill: '#3a4a52', stroke: '#47e08a', text: '#ffffff', label: 'КС' },
  immortal: { fill: '#3e5058', stroke: '#dfe9ef', text: '#ffffff', label: 'Бс' },
  lychguard: { fill: '#3a4a52', stroke: '#dfe9ef', text: '#ffffff', label: 'Лг' },
  canoptekWraith: { fill: '#46585f', stroke: '#47e08a', text: '#ffffff', label: 'Пз' },
  skorpekh: { fill: '#3a4a52', stroke: '#47e08a', text: '#ffffff', label: 'Ск' },
  scarab: { fill: '#46585f', stroke: '#47e08a', text: '#ffffff', label: 'Рой' },
  // Aeldari
  farseer: { fill: '#5a3f9c', stroke: '#f0c75e', text: '#ffffff', label: 'Фр' },
  guardian: { fill: '#6a4cb0', stroke: '#ddd0f7', text: '#ffffff', label: 'Ст' },
  heavyPlatform: { fill: '#6a4cb0', stroke: '#f0c75e', text: '#ffffff', label: 'ПТО' },
  direAvenger: { fill: '#5a3f9c', stroke: '#ddd0f7', text: '#ffffff', label: 'ГМ' },
  autarch: { fill: '#5a3f9c', stroke: '#f0c75e', text: '#ffffff', label: 'Ав' },
  aeldariRanger: { fill: '#4a3a7a', stroke: '#ddd0f7', text: '#ffffff', label: 'Рн' },
  wraithguard: { fill: '#6a52b0', stroke: '#f0c75e', text: '#ffffff', label: 'СП' },
  hawkExarch: { fill: '#5a3f9c', stroke: '#f0c75e', text: '#ffffff', label: 'ЭЯ' },
  swoopingHawk: { fill: '#6a52b0', stroke: '#ddd0f7', text: '#ffffff', label: 'Яс' },
  exarch: { fill: '#5a3f9c', stroke: '#f0c75e', text: '#ffffff', label: 'Эк' },
  windrider: { fill: '#6a4cb0', stroke: '#ddd0f7', text: '#ffffff', label: 'Рв' },
  windriderLaser: { fill: '#6a4cb0', stroke: '#ddd0f7', text: '#ffffff', label: 'РЛ' },
  windriderCannon: { fill: '#6a4cb0', stroke: '#ddd0f7', text: '#ffffff', label: 'РП' },
  // Adeptus Mechanicus: deep-red robes, brass trim
  techDominus: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: 'Дм' },
  techManipulus: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: 'Мн' },
  rangerAlpha: { fill: '#8a1f1f', stroke: '#e8b04a', text: '#ffffff', label: 'АРн' },
  ranger: { fill: '#9a2a2a', stroke: '#f1d9a6', text: '#ffffff', label: 'Рн' },
  rangerOmnispex: { fill: '#9a2a2a', stroke: '#e8b04a', text: '#ffffff', label: 'Ро' },
  rangerArc: { fill: '#9a2a2a', stroke: '#f1d9a6', text: '#ffffff', label: 'РД' },
  rangerCaliver: { fill: '#9a2a2a', stroke: '#f1d9a6', text: '#ffffff', label: 'РП' },
  vanguardAlpha: { fill: '#8a1f1f', stroke: '#e8b04a', text: '#ffffff', label: 'АА' },
  vanguard: { fill: '#9a2a2a', stroke: '#f1d9a6', text: '#ffffff', label: 'Ав' },
  vanguardArc: { fill: '#9a2a2a', stroke: '#f1d9a6', text: '#ffffff', label: 'АД' },
  vanguardCaliver: { fill: '#9a2a2a', stroke: '#f1d9a6', text: '#ffffff', label: 'АП' },
  breacher: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: 'Пб' },
  breacherTorsion: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: 'ПТ' },
  breacherHydraulic: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: 'ПГ' },
  destroyer: { fill: '#8a1f1f', stroke: '#f1d9a6', text: '#ffffff', label: 'Рз' },
  destroyerCulverin: { fill: '#8a1f1f', stroke: '#e8b04a', text: '#ffffff', label: 'Кр' },
  sicarianPrinceps: { fill: '#5e1717', stroke: '#e8b04a', text: '#ffffff', label: 'ПС' },
  sicarian: { fill: '#6e1b1b', stroke: '#f1d9a6', text: '#ffffff', label: 'Сх' },
  sicarianTaser: { fill: '#6e1b1b', stroke: '#e8b04a', text: '#ffffff', label: 'Тз' },
  kastelan: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: 'Кс' },
  kastelanGun: { fill: '#7d1d1d', stroke: '#f1d9a6', text: '#ffffff', label: 'КБ' },
  // wargear variants (army builder loadouts)
  techDominusSerpenta: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: 'Дм' },
  techDominusRay: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: 'Дм' },
  techDominusSerpentaRay: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: 'Дм' },
  techManipulusCannon: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: 'Мн' },
  rangerAlphaPistol: { fill: '#8a1f1f', stroke: '#e8b04a', text: '#ffffff', label: 'АРн' },
  rangerArquebus: { fill: '#9a2a2a', stroke: '#f1d9a6', text: '#ffffff', label: 'РА' },
  vanguardAlphaCarbine: { fill: '#8a1f1f', stroke: '#e8b04a', text: '#ffffff', label: 'АА' },
  vanguardArquebus: { fill: '#9a2a2a', stroke: '#f1d9a6', text: '#ffffff', label: 'АА' },
  vanguardOmnispex: { fill: '#9a2a2a', stroke: '#e8b04a', text: '#ffffff', label: 'Ао' },
  breacherTorsionHydraulic: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: 'ПТГ' },
  destroyerFlamer: { fill: '#8a1f1f', stroke: '#f1d9a6', text: '#ffffff', label: 'РО' },
  destroyerCulverinPhosphor: { fill: '#8a1f1f', stroke: '#e8b04a', text: '#ffffff', label: 'КФ' },
  kastelanHeavyFists: { fill: '#7d1d1d', stroke: '#f1d9a6', text: '#ffffff', label: 'КТ' },
  kastelanCombustorBlaster: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: 'КсБ' },
  kastelanCombustorTwin: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: 'КсС' },
  kastelanHeavyTwin: { fill: '#7d1d1d', stroke: '#f1d9a6', text: '#ffffff', label: 'КБС' },
  // Serberys Sulphurhounds, Ironstrider Ballistarii, Onager Dunecrawler, Corpuscarii Electro-Priests
  sulphurhoundAlpha: { fill: '#8a1f1f', stroke: '#e8b04a', text: '#ffffff', label: 'АСх' },
  sulphurhound: { fill: '#9a2a2a', stroke: '#f1d9a6', text: '#ffffff', label: 'Сх' },
  sulphurhoundCarbine: { fill: '#9a2a2a', stroke: '#e8b04a', text: '#ffffff', label: 'СхК' },
  ironstrider: { fill: '#7d1d1d', stroke: '#f1d9a6', text: '#ffffff', label: 'Ай' },
  ironstriderLascannon: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: 'АйЛ' },
  onager: { fill: '#6e1b1b', stroke: '#e8b04a', text: '#ffffff', label: 'Он' },
  onagerMissiles: { fill: '#6e1b1b', stroke: '#f1d9a6', text: '#ffffff', label: 'ОнР' },
  onagerNeutron: { fill: '#6e1b1b', stroke: '#e8b04a', text: '#ffffff', label: 'ОнН' },
  onagerPhosphor: { fill: '#6e1b1b', stroke: '#f1d9a6', text: '#ffffff', label: 'ОнФ' },
  electroPriest: { fill: '#8a1f1f', stroke: '#f1d9a6', text: '#ffffff', label: 'Эж' },
}

// wargear variants without their own token use the token of the profile they are built from
for (const [id, from] of Object.entries(VARIANT_FROM)) if (!TOKENS[id] && TOKENS[from]) TOKENS[id] = TOKENS[from]

// Blueprint look: dark drafting paper, light line work.
export const TERRAIN_STYLE: Record<TerrainKind, { fill: string; stroke: string; label: string }> = {
  ruin: { fill: 'rgba(207,233,255,0.10)', stroke: '#cfe9ff', label: 'Руины: блокируют обзор, укрытие' },
  crater: { fill: 'rgba(255,214,140,0.06)', stroke: '#f5d08a', label: 'Воронка: укрытие для пехоты' },
  woods: { fill: 'rgba(150,230,170,0.08)', stroke: '#9fe3b0', label: 'Лес: закрывает обзор, укрытие; техника не проходит' },
  barricade: { fill: 'rgba(207,233,255,0.10)', stroke: '#cfe9ff', label: 'Баррикада: закрывает обзор, укрытие' },
  container: { fill: 'rgba(255,180,150,0.10)', stroke: '#ffb49a', label: 'Контейнер: закрывает обзор; внутри нельзя стоять' },
}

export const BOARD_STYLE = {
  mat: '#0d2b4e',
  grid: 'rgba(160,210,255,0.10)',
  gridMajor: 'rgba(160,210,255,0.30)',
  ink: '#cfe9ff',
  edge: '#06172b',
  objective: '#ffd166',
}

/** Line colour per faction on the blueprint board (tokens, rings, zones). */
export const FACTION_LINE = BLUEPRINT_LINE

export const tokenImageFor = (profileId: string, custom: Record<string, string> = {}): string | undefined =>
  custom[profileId] ?? TOKENS[profileId]?.image ?? portraitFor(profileId)
