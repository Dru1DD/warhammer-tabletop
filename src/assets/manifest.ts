// Central asset manifest. Token art priority: the player's own uploaded photo
// → `image` set here (e.g. a file in /public/tokens/) → built-in original SVG
// portrait (src/assets/tokenArt.ts). No third-party art — see docs/assets.md.

import type { PlayerId, TerrainKind } from '../game/types'
import { BLUEPRINT_LINE, mechanicusEmblem, portraitFor, svgDataUrl } from './tokenArt'
import { VARIANT_FROM } from '../game/data/wargearExtra'
import { tr } from '../i18n/index'

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
  lieutenant: { fill: '#1f4e9c', stroke: '#e4b33a', text: '#ffffff', label: tr('Lt') },
  captain: { fill: '#1f4e9c', stroke: '#e4b33a', text: '#ffffff', label: tr('Cpt') },
  hellblasterSergeant: { fill: '#1f4e9c', stroke: '#c9d6ee', text: '#ffffff', label: tr('HsS') },
  hellblaster: { fill: '#2b5fb5', stroke: '#c9d6ee', text: '#ffffff', label: tr('Hb') },
  infernusSergeant: { fill: '#1f4e9c', stroke: '#c9d6ee', text: '#ffffff', label: tr('InS') },
  infernusMarine: { fill: '#2b5fb5', stroke: '#c9d6ee', text: '#ffffff', label: tr('In') },
  bladeguardSergeant: { fill: '#1f4e9c', stroke: '#e4b33a', text: '#ffffff', label: tr('BgS') },
  bladeguardVeteran: { fill: '#2b5fb5', stroke: '#e4b33a', text: '#ffffff', label: tr('Bg') },
  intercessorSergeant: { fill: '#1f4e9c', stroke: '#c9d6ee', text: '#ffffff', label: tr('IcS') },
  intercessor: { fill: '#2b5fb5', stroke: '#c9d6ee', text: '#ffffff', label: tr('Ic') },
  intercessorGL: { fill: '#2b5fb5', stroke: '#c9d6ee', text: '#ffffff', label: tr('GL') },
  nob: { fill: '#3f7a2a', stroke: '#b83a2b', text: '#ffffff', label: tr('Nob') },
  boy: { fill: '#4d8f33', stroke: '#d7e5c3', text: '#ffffff', label: tr('B') },
  boyBigShoota: { fill: '#4d8f33', stroke: '#d7e5c3', text: '#ffffff', label: tr('BS') },
  boyRokkit: { fill: '#4d8f33', stroke: '#d7e5c3', text: '#ffffff', label: tr('R') },
  assaultSergeant: { fill: '#1f4e9c', stroke: '#c9d6ee', text: '#ffffff', label: tr('AIS') },
  assaultIntercessor: { fill: '#2b5fb5', stroke: '#c9d6ee', text: '#ffffff', label: tr('AI') },
  redemptor: { fill: '#1f4e9c', stroke: '#e4b33a', text: '#ffffff', label: tr('Rd') },
  deffDread: { fill: '#3f7a2a', stroke: '#b83a2b', text: '#ffffff', label: tr('DD') },
  warboss: { fill: '#3f7a2a', stroke: '#e4b33a', text: '#ffffff', label: tr('WB') },
  nobzNob: { fill: '#3f7a2a', stroke: '#b83a2b', text: '#ffffff', label: tr('N') },
  gretchin: { fill: '#6a9a3a', stroke: '#d7e5c3', text: '#ffffff', label: tr('G') },
  kommandoNob: { fill: '#2f5a24', stroke: '#b83a2b', text: '#ffffff', label: tr('KN') },
  kommando: { fill: '#3a6a2c', stroke: '#d7e5c3', text: '#ffffff', label: tr('K') },
  // Tyranids
  hiveTyrant: { fill: '#8c2f4a', stroke: '#ff7a8a', text: '#ffffff', label: tr('HT') },
  termagant: { fill: '#a33a58', stroke: '#f3c4cc', text: '#ffffff', label: tr('Tg') },
  termagantShard: { fill: '#a33a58', stroke: '#f3c4cc', text: '#ffffff', label: tr('TgS') },
  termagantSpike: { fill: '#a33a58', stroke: '#f3c4cc', text: '#ffffff', label: tr('TgP') },
  termagantWeb: { fill: '#a33a58', stroke: '#f3c4cc', text: '#ffffff', label: tr('TgW') },
  hormagaunt: { fill: '#8c2f4a', stroke: '#f3c4cc', text: '#ffffff', label: tr('Hg') },
  tyranidPrime: { fill: '#8c2f4a', stroke: '#ff7a8a', text: '#ffffff', label: tr('Pr') },
  wingedPrime: { fill: '#8c2f4a', stroke: '#ff7a8a', text: '#ffffff', label: tr('WP') },
  neurothrope: { fill: '#7a2a5a', stroke: '#ff7a8a', text: '#ffffff', label: tr('Nt') },
  zoanthrope: { fill: '#7a2a5a', stroke: '#f3c4cc', text: '#ffffff', label: tr('Zo') },
  carnifex: { fill: '#8c2f4a', stroke: '#ff7a8a', text: '#ffffff', label: tr('Cx') },
  barbgaunt: { fill: '#a33a58', stroke: '#f3c4cc', text: '#ffffff', label: tr('Bb') },
  tyranidWarrior: { fill: '#a33a58', stroke: '#f3c4cc', text: '#ffffff', label: tr('Wr') },
  tyranidWarriorVenom: { fill: '#a33a58', stroke: '#f3c4cc', text: '#ffffff', label: tr('WrV') },
  tyranidWarriorStrangler: { fill: '#a33a58', stroke: '#f3c4cc', text: '#ffffff', label: tr('WrS') },
  // Necrons
  overlord: { fill: '#3a4a52', stroke: '#47e08a', text: '#ffffff', label: tr('Ov') },
  necronWarrior: { fill: '#46585f', stroke: '#dfe9ef', text: '#ffffff', label: tr('NW') },
  royalWarden: { fill: '#3a4a52', stroke: '#47e08a', text: '#ffffff', label: tr('RW') },
  immortal: { fill: '#3e5058', stroke: '#dfe9ef', text: '#ffffff', label: tr('Im') },
  lychguard: { fill: '#3a4a52', stroke: '#dfe9ef', text: '#ffffff', label: tr('Ly') },
  canoptekWraith: { fill: '#46585f', stroke: '#47e08a', text: '#ffffff', label: tr('CW') },
  skorpekh: { fill: '#3a4a52', stroke: '#47e08a', text: '#ffffff', label: tr('Sk') },
  scarab: { fill: '#46585f', stroke: '#47e08a', text: '#ffffff', label: tr('Sw') },
  // Aeldari
  farseer: { fill: '#5a3f9c', stroke: '#f0c75e', text: '#ffffff', label: tr('Fs') },
  guardian: { fill: '#6a4cb0', stroke: '#ddd0f7', text: '#ffffff', label: tr('Gd') },
  heavyPlatform: { fill: '#6a4cb0', stroke: '#f0c75e', text: '#ffffff', label: tr('HWP') },
  direAvenger: { fill: '#5a3f9c', stroke: '#ddd0f7', text: '#ffffff', label: tr('DA') },
  autarch: { fill: '#5a3f9c', stroke: '#f0c75e', text: '#ffffff', label: tr('Au') },
  aeldariRanger: { fill: '#4a3a7a', stroke: '#ddd0f7', text: '#ffffff', label: tr('Rg') },
  wraithguard: { fill: '#6a52b0', stroke: '#f0c75e', text: '#ffffff', label: tr('HsS') },
  hawkExarch: { fill: '#5a3f9c', stroke: '#f0c75e', text: '#ffffff', label: tr('HE') },
  swoopingHawk: { fill: '#6a52b0', stroke: '#ddd0f7', text: '#ffffff', label: tr('SH') },
  exarch: { fill: '#5a3f9c', stroke: '#f0c75e', text: '#ffffff', label: tr('Ex') },
  windrider: { fill: '#6a4cb0', stroke: '#ddd0f7', text: '#ffffff', label: tr('Wi') },
  windriderLaser: { fill: '#6a4cb0', stroke: '#ddd0f7', text: '#ffffff', label: tr('WiL') },
  windriderCannon: { fill: '#6a4cb0', stroke: '#ddd0f7', text: '#ffffff', label: tr('WiC') },
  // Adeptus Mechanicus: deep-red robes, brass trim
  techDominus: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: tr('Dm') },
  techManipulus: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: tr('Mp') },
  rangerAlpha: { fill: '#8a1f1f', stroke: '#e8b04a', text: '#ffffff', label: tr('ARg') },
  ranger: { fill: '#9a2a2a', stroke: '#f1d9a6', text: '#ffffff', label: tr('Rg') },
  rangerOmnispex: { fill: '#9a2a2a', stroke: '#e8b04a', text: '#ffffff', label: tr('RgO') },
  rangerArc: { fill: '#9a2a2a', stroke: '#f1d9a6', text: '#ffffff', label: tr('RgA') },
  rangerCaliver: { fill: '#9a2a2a', stroke: '#f1d9a6', text: '#ffffff', label: tr('WiC') },
  vanguardAlpha: { fill: '#8a1f1f', stroke: '#e8b04a', text: '#ffffff', label: tr('VA') },
  vanguard: { fill: '#9a2a2a', stroke: '#f1d9a6', text: '#ffffff', label: tr('Au') },
  vanguardArc: { fill: '#9a2a2a', stroke: '#f1d9a6', text: '#ffffff', label: tr('VAa') },
  vanguardCaliver: { fill: '#9a2a2a', stroke: '#f1d9a6', text: '#ffffff', label: tr('VAc') },
  breacher: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: tr('Br') },
  breacherTorsion: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: tr('BrT') },
  breacherHydraulic: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: tr('BrH') },
  destroyer: { fill: '#8a1f1f', stroke: '#f1d9a6', text: '#ffffff', label: tr('De') },
  destroyerCulverin: { fill: '#8a1f1f', stroke: '#e8b04a', text: '#ffffff', label: tr('Cu') },
  sicarianPrinceps: { fill: '#5e1717', stroke: '#e8b04a', text: '#ffffff', label: tr('SP') },
  sicarian: { fill: '#6e1b1b', stroke: '#f1d9a6', text: '#ffffff', label: tr('Si') },
  sicarianTaser: { fill: '#6e1b1b', stroke: '#e8b04a', text: '#ffffff', label: tr('SiT') },
  kastelan: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: tr('Ka') },
  kastelanGun: { fill: '#7d1d1d', stroke: '#f1d9a6', text: '#ffffff', label: tr('KaG') },
  // wargear variants (army builder loadouts)
  techDominusSerpenta: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: tr('Dm') },
  techDominusRay: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: tr('Dm') },
  techDominusSerpentaRay: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: tr('Dm') },
  techManipulusCannon: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: tr('Mp') },
  rangerAlphaPistol: { fill: '#8a1f1f', stroke: '#e8b04a', text: '#ffffff', label: tr('ARg') },
  rangerArquebus: { fill: '#9a2a2a', stroke: '#f1d9a6', text: '#ffffff', label: tr('RgQ') },
  vanguardAlphaCarbine: { fill: '#8a1f1f', stroke: '#e8b04a', text: '#ffffff', label: tr('VA') },
  vanguardArquebus: { fill: '#9a2a2a', stroke: '#f1d9a6', text: '#ffffff', label: tr('VA') },
  vanguardOmnispex: { fill: '#9a2a2a', stroke: '#e8b04a', text: '#ffffff', label: tr('VO') },
  breacherTorsionHydraulic: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: tr('BrTH') },
  destroyerFlamer: { fill: '#8a1f1f', stroke: '#f1d9a6', text: '#ffffff', label: tr('DeF') },
  destroyerCulverinPhosphor: { fill: '#8a1f1f', stroke: '#e8b04a', text: '#ffffff', label: tr('CuP') },
  kastelanHeavyFists: { fill: '#7d1d1d', stroke: '#f1d9a6', text: '#ffffff', label: tr('KaF') },
  kastelanCombustorBlaster: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: tr('KaCB') },
  kastelanCombustorTwin: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: tr('KaCT') },
  kastelanHeavyTwin: { fill: '#7d1d1d', stroke: '#f1d9a6', text: '#ffffff', label: tr('KaHT') },
  // Serberys Sulphurhounds, Ironstrider Ballistarii, Onager Dunecrawler, Corpuscarii Electro-Priests
  sulphurhoundAlpha: { fill: '#8a1f1f', stroke: '#e8b04a', text: '#ffffff', label: tr('ASh') },
  sulphurhound: { fill: '#9a2a2a', stroke: '#f1d9a6', text: '#ffffff', label: tr('Sh') },
  sulphurhoundCarbine: { fill: '#9a2a2a', stroke: '#e8b04a', text: '#ffffff', label: tr('ShC') },
  ironstrider: { fill: '#7d1d1d', stroke: '#f1d9a6', text: '#ffffff', label: tr('Is') },
  ironstriderLascannon: { fill: '#7d1d1d', stroke: '#e8b04a', text: '#ffffff', label: tr('IsL') },
  onager: { fill: '#6e1b1b', stroke: '#e8b04a', text: '#ffffff', label: tr('On') },
  onagerMissiles: { fill: '#6e1b1b', stroke: '#f1d9a6', text: '#ffffff', label: tr('OnM') },
  onagerNeutron: { fill: '#6e1b1b', stroke: '#e8b04a', text: '#ffffff', label: tr('OnN') },
  onagerPhosphor: { fill: '#6e1b1b', stroke: '#f1d9a6', text: '#ffffff', label: tr('OnP') },
  electroPriest: { fill: '#8a1f1f', stroke: '#f1d9a6', text: '#ffffff', label: tr('EP') },
  dunerider: { fill: '#6e1b1b', stroke: '#e8b04a', text: '#ffffff', label: tr('SD') },
  // vehicles and monsters of data/vehicles.ts
  rhino: { fill: '#1f4e9c', stroke: '#e4b33a', text: '#ffffff', label: tr('Rh') },
  predatorAnnihilator: { fill: '#1f4e9c', stroke: '#e4b33a', text: '#ffffff', label: tr('PA') },
  trukk: { fill: '#3f7a2a', stroke: '#b83a2b', text: '#ffffff', label: tr('Tr') },
  battlewagon: { fill: '#3f7a2a', stroke: '#b83a2b', text: '#ffffff', label: tr('BW') },
  ghostArk: { fill: '#46585f', stroke: '#47e08a', text: '#ffffff', label: tr('GA') },
  doomsdayArk: { fill: '#46585f', stroke: '#47e08a', text: '#ffffff', label: tr('DA') },
  waveSerpent: { fill: '#6a52b0', stroke: '#f0c75e', text: '#ffffff', label: tr('WS') },
  firePrism: { fill: '#6a52b0', stroke: '#f0c75e', text: '#ffffff', label: tr('FP') },
  exocrine: { fill: '#8c2f4a', stroke: '#ff7a8a', text: '#ffffff', label: tr('Ex') },
  tyrannofex: { fill: '#8c2f4a', stroke: '#ff7a8a', text: '#ffffff', label: tr('TF') },
}

// wargear variants without their own token use the token of the profile they are built from
for (const [id, from] of Object.entries(VARIANT_FROM)) if (!TOKENS[id] && TOKENS[from]) TOKENS[id] = TOKENS[from]

// Blueprint look: dark drafting paper, light line work.
export const TERRAIN_STYLE: Record<TerrainKind, { fill: string; stroke: string; label: string }> = {
  ruin: { fill: 'rgba(207,233,255,0.10)', stroke: '#cfe9ff', label: tr('Ruins: block line of sight, cover') },
  crater: { fill: 'rgba(255,214,140,0.06)', stroke: '#f5d08a', label: tr('Crater: cover for infantry') },
  woods: { fill: 'rgba(150,230,170,0.08)', stroke: '#9fe3b0', label: tr('Woods: block line of sight, cover; vehicles cannot enter') },
  barricade: { fill: 'rgba(207,233,255,0.10)', stroke: '#cfe9ff', label: tr('Barricade: blocks line of sight, cover') },
  container: { fill: 'rgba(255,180,150,0.10)', stroke: '#ffb49a', label: tr('Container: blocks line of sight; you cannot stand inside') },
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
