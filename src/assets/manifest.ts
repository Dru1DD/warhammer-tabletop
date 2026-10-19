// Central asset manifest. Token art priority: the player's own uploaded photo
// → `image` set here (e.g. a file in /public/tokens/) → built-in original SVG
// portrait (src/assets/tokenArt.ts). No third-party art — see docs/assets.md.

import type { PlayerId, TerrainKind } from '../game/types'
import { portraitFor } from './tokenArt'

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

export const TERRAIN_STYLE: Record<TerrainKind, { fill: string; stroke: string; label: string }> = {
  ruin: { fill: '#6b5a48', stroke: '#3e3328', label: 'Руины: блокируют обзор, укрытие' },
  crater: { fill: '#8a7a5c', stroke: '#5d5139', label: 'Воронка: укрытие для пехоты' },
}

export const BOARD_STYLE = {
  mat: '#7d8b6a',
  matAlt: '#748260',
  grid: 'rgba(255,255,255,0.08)',
  edge: '#2b2a24',
  objective: '#e8d48a',
}

export const tokenImageFor = (profileId: string, custom: Record<string, string> = {}): string | undefined =>
  custom[profileId] ?? TOKENS[profileId]?.image ?? portraitFor(profileId)
