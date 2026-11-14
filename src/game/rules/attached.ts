// Attached units (core rules 19, 24.22 Leader, 24.34 Support, 25.04 Muster Armies). Before the battle each Leader or
// Support character may join one bodyguard unit its datasheet lists; a bodyguard unit takes one Leader and one Support;
// a Support character must join a unit. The attached unit is one unit for all rules: here one UnitState whose models
// include the characters' (`UnitState.attached` says which). How the rules read it: gameState.ts (liveDatasheets,
// leadingAbility, attackToughness); docs/leaders.md.
import { DATASHEETS } from '../data/datasheets'
import type { AttachedPart, UnitState } from '../types'

/** The bodyguard datasheets a character can join (none for other datasheets). */
export const leadsOf = (characterId: string): string[] => DATASHEETS[characterId]?.leads ?? []
export const isCharacterDatasheet = (id: string) => leadsOf(id).length > 0
/** Leader or Support: a unit takes one of each. */
export const attachKind = (characterId: string): AttachedPart['kind'] => (DATASHEETS[characterId]?.support ? 'support' : 'leader')
export const canLead = (characterId: string, bodyguardId: string) => leadsOf(characterId).includes(bodyguardId)

/** Joins `character` to `bodyguard`: its models go into the bodyguard unit, which becomes the attached unit and is
 * returned (changed). Its starting strength counts every model (01.02.01). */
export function attachUnit(bodyguard: UnitState, character: UnitState): UnitState {
  const part: AttachedPart = { datasheetId: character.datasheetId, kind: attachKind(character.datasheetId), models: character.models.map((m) => m.id) }
  bodyguard.models.push(...character.models)
  bodyguard.attached = [...(bodyguard.attached ?? []), part]
  bodyguard.startingModels += character.startingModels
  bodyguard.name = `${bodyguard.name} + ${character.name}`
  return bodyguard
}

/** Models of the unit that belong to its attached characters. */
export const characterModelCount = (u: UnitState) => u.attached?.reduce((a, p) => a + p.models.length, 0) ?? 0

/** The pieces a unit was mustered from: its own datasheet with its bodyguard models, then each attached character. */
export const musteredParts = (u: UnitState): { datasheetId: string; models: number }[] => [
  { datasheetId: u.datasheetId, models: u.startingModels - characterModelCount(u) },
  ...(u.attached ?? []).map((p) => ({ datasheetId: p.datasheetId, models: p.models.length })),
]
