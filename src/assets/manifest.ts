// Central asset manifest. Token art priority: the player's own uploaded photo
// → `image` set here (e.g. a file in /public/tokens/) → built-in original SVG
// portrait (src/assets/tokenArt.ts). No third-party art — see docs/assets.md.

import type { PlayerId, TerrainKind } from '../game/types'
import { BLUEPRINT_LINE, portraitFor } from './tokenArt'

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
}

export const TOKENS: Record<string, TokenStyle> = {
  lieutenant: { fill: '#1f4e9c', stroke: '#e4b33a', text: '#ffffff', label: 'Лт' },
  intercessorSergeant: { fill: '#1f4e9c', stroke: '#c9d6ee', text: '#ffffff', label: 'Сж' },
  intercessor: { fill: '#2b5fb5', stroke: '#c9d6ee', text: '#ffffff', label: 'И' },
  intercessorGL: { fill: '#2b5fb5', stroke: '#c9d6ee', text: '#ffffff', label: 'Гр' },
  nob: { fill: '#3f7a2a', stroke: '#b83a2b', text: '#ffffff', label: 'Нб' },
  boy: { fill: '#4d8f33', stroke: '#d7e5c3', text: '#ffffff', label: 'Б' },
  boyBigShoota: { fill: '#4d8f33', stroke: '#d7e5c3', text: '#ffffff', label: 'БШ' },
  boyRokkit: { fill: '#4d8f33', stroke: '#d7e5c3', text: '#ffffff', label: 'Р' },
}

// Blueprint look: dark drafting paper, light line work.
export const TERRAIN_STYLE: Record<TerrainKind, { fill: string; stroke: string; label: string }> = {
  ruin: { fill: 'rgba(207,233,255,0.10)', stroke: '#cfe9ff', label: 'Руины: блокируют обзор, укрытие' },
  crater: { fill: 'rgba(255,214,140,0.06)', stroke: '#f5d08a', label: 'Воронка: укрытие для пехоты' },
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
