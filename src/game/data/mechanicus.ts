import type { Datasheet, ModelProfile, Weapon } from '../types'
import { tr } from '../../i18n/index'

// Adeptus Mechanicus, 11th-edition datasheets as transcribed by Wahapedia (checked 2026-11-09):
//   Tech-Priest Dominus, Tech-Priest Manipulus, Skitarii Rangers, Skitarii Vanguard, Kataphron Breachers,
//   Kataphron Destroyers, Sicarian Infiltrators, Kastelan Robots. See docs/mechanicus.md.

const anti = (keyword: string, roll: number) => ({ keyword, roll })

export const MECHANICUS_WEAPONS: Record<string, Weapon> = {
  // ---- Tech-Priest Dominus
  macrostubber: {
    id: 'macrostubber', name: tr('Macrostubber'),
    profiles: [{ name: '', range: 12, attacks: 5, skill: 3, s: 4, ap: 0, d: 1, keywords: { closeQuarters: true } }],
  },
  phosphorSerpenta: {
    id: 'phosphorSerpenta', name: tr('Phosphor Serpenta'),
    profiles: [{ name: '', range: 18, attacks: 1, skill: 3, s: 5, ap: -1, d: 2, keywords: { closeQuarters: true, ignoresCover: true } }],
  },
  volkiteBlaster: {
    id: 'volkiteBlaster', name: tr('Volkite Blaster'),
    profiles: [{ name: '', range: 24, attacks: 3, skill: 3, s: 5, ap: 0, d: 2, keywords: { devastatingWounds: true } }],
  },
  eradicationRay: {
    id: 'eradicationRay', name: tr('Eradication Ray'),
    profiles: [
      { name: tr('Dissipated'), range: 24, attacks: 0, randomA: 'D3', skill: 3, s: 6, ap: -1, d: 1, keywords: {} },
      { name: tr('Focused'), range: 12, attacks: 0, randomA: 'D3', skill: 3, s: 6, ap: -2, d: 2, keywords: {} },
    ],
  },
  omnissianAxe: {
    id: 'omnissianAxe', name: tr('Omnissian Axe'),
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 3, s: 6, ap: -2, d: 2, keywords: {} }],
  },
  // ---- Tech-Priest Manipulus
  magnarailLance: {
    id: 'magnarailLance', name: tr('Magnarail Lance'),
    profiles: [{ name: '', range: 36, attacks: 1, skill: 3, s: 7, ap: -2, d: 3, keywords: { heavy: true } }],
  },
  transonicCannon: {
    id: 'transonicCannon', name: tr('Transonic Cannon'),
    profiles: [{ name: '', range: 12, attacks: 0, randomA: 'D6', skill: null, s: 4, ap: 0, d: 2, keywords: { torrent: true, devastatingWounds: true } }],
  },
  omnissianStaff: {
    id: 'omnissianStaff', name: tr('Omnissian Staff'),
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 3, s: 6, ap: -1, d: 2, keywords: {} }],
  },
  // ---- Skitarii (Rangers and Vanguard)
  galvanicRifle: {
    id: 'galvanicRifle', name: tr('Galvanic Rifle'),
    profiles: [{ name: '', range: 30, attacks: 2, skill: 4, s: 4, ap: 0, d: 1, keywords: {} }],
  },
  radiumCarbine: {
    id: 'radiumCarbine', name: tr('Radium Carbine'),
    profiles: [{ name: '', range: 18, attacks: 3, skill: 4, s: 3, ap: 0, d: 1, keywords: { anti: anti('INFANTRY', 4) } }],
  },
  arcRifle: {
    id: 'arcRifle', name: tr('Arc Rifle'),
    profiles: [{ name: '', range: 30, attacks: 1, skill: 4, s: 8, ap: -1, d: 0, randomD: 'D3', keywords: { anti: anti('VEHICLE', 4), devastatingWounds: true, rapidFire: 1 } }],
  },
  transuranicArquebus: {
    id: 'transuranicArquebus', name: tr('Transuranic Arquebus'),
    profiles: [{ name: '', range: 36, attacks: 1, skill: 4, s: 7, ap: -2, d: 0, randomD: 'D3', keywords: { heavy: true, precision: true } }],
  },
  plasmaCaliver: {
    id: 'plasmaCaliver', name: tr('Plasma Caliver'),
    profiles: [
      { name: tr('Standard'), range: 30, attacks: 2, skill: 4, s: 7, ap: -2, d: 1, keywords: {} },
      { name: tr('Supercharge'), range: 30, attacks: 2, skill: 4, s: 8, ap: -3, d: 2, keywords: { hazardous: true } },
    ],
  },
  mechanicusPistol: {
    id: 'mechanicusPistol', name: tr('Mechanicus Pistol'),
    profiles: [{ name: '', range: 12, attacks: 1, skill: 4, s: 6, ap: -1, d: 1, keywords: { closeQuarters: true, devastatingWounds: true } }],
  },
  alphaCombatWeapon: {
    id: 'alphaCombatWeapon', name: tr('Alpha Combat Weapon'),
    profiles: [{ name: '', range: 'melee', attacks: 2, skill: 4, s: 5, ap: -1, d: 1, keywords: {} }],
  },
  skitariiCCW: {
    id: 'skitariiCCW', name: tr('Close Combat Weapon'),
    profiles: [{ name: '', range: 'melee', attacks: 1, skill: 4, s: 3, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Kataphron Breachers
  heavyArcRifle: {
    id: 'heavyArcRifle', name: tr('Heavy Arc Rifle'),
    profiles: [{ name: '', range: 30, attacks: 2, skill: 4, s: 8, ap: -2, d: 3, keywords: { anti: anti('VEHICLE', 4), rapidFire: 2 } }],
  },
  torsionCannon: {
    id: 'torsionCannon', name: tr('Torsion Cannon'),
    profiles: [{ name: '', range: 36, attacks: 0, randomA: 'D3', skill: 4, s: 6, ap: -2, d: 2, keywords: { anti: anti('INFANTRY', 2), blast: 1 } }],
  },
  arcClaw: {
    id: 'arcClaw', name: tr('Arc Claw'),
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 4, s: 5, ap: -1, d: 1, keywords: { anti: anti('VEHICLE', 4) } }],
  },
  hydraulicClaw: {
    id: 'hydraulicClaw', name: tr('Hydraulic Claw'),
    profiles: [{ name: '', range: 'melee', attacks: 2, skill: 4, s: 8, ap: -2, d: 3, keywords: {} }],
  },
  // ---- Kataphron Destroyers
  heavyGravCannon: {
    id: 'heavyGravCannon', name: tr('Heavy Grav-cannon'),
    profiles: [{ name: '', range: 30, attacks: 4, skill: 4, s: 6, ap: -1, d: 2, keywords: { anti: anti('VEHICLE', 2) } }],
  },
  plasmaCulverin: {
    id: 'plasmaCulverin', name: tr('Kataphron Plasma Culverin'),
    profiles: [
      { name: tr('Standard'), range: 36, attacks: 4, skill: 4, s: 7, ap: -2, d: 1, keywords: {} },
      { name: tr('Supercharge'), range: 36, attacks: 4, skill: 4, s: 8, ap: -3, d: 2, keywords: { hazardous: true } },
    ],
  },
  phosphorBlaster: {
    id: 'phosphorBlaster', name: tr('Phosphor Blaster'),
    profiles: [{ name: '', range: 24, attacks: 1, skill: 4, s: 5, ap: 0, d: 1, keywords: { ignoresCover: true, rapidFire: 1 } }],
  },
  cognisFlamer: {
    id: 'cognisFlamer', name: tr('Cognis Flamer'),
    profiles: [{ name: '', range: 12, attacks: 0, randomA: 'D6', skill: null, s: 4, ap: 0, d: 1, keywords: { ignoresCover: true, torrent: true } }],
  },
  kataphronCCW: {
    id: 'kataphronCCW', name: tr('Close Combat Weapon'),
    profiles: [{ name: '', range: 'melee', attacks: 2, skill: 4, s: 5, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Sicarian Infiltrators
  stubcarbine: {
    id: 'stubcarbine', name: tr('Stubcarbine'),
    profiles: [{ name: '', range: 12, attacks: 3, skill: 4, s: 4, ap: 0, d: 1, keywords: { closeQuarters: true } }],
  },
  flechetteBlaster: {
    id: 'flechetteBlaster', name: tr('Flechette Blaster'),
    profiles: [{ name: '', range: 12, attacks: 5, skill: 4, s: 3, ap: 0, d: 1, keywords: { closeQuarters: true } }],
  },
  sicarianPowerWeapon: {
    id: 'sicarianPowerWeapon', name: tr('Power Weapon'),
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 4, s: 4, ap: -2, d: 1, keywords: {} }],
  },
  taserGoad: {
    id: 'taserGoad', name: tr('Taser Goad'),
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 4, s: 6, ap: -1, d: 1, keywords: { sustainedHits: 2 } }],
  },
  // ---- Kastelan Robots
  incendineCombustor: {
    id: 'incendineCombustor', name: tr('Incendine Combustor'),
    profiles: [{ name: '', range: 12, attacks: 0, randomA: 'D6', skill: null, s: 6, ap: -1, d: 1, keywords: { ignoresCover: true, torrent: true } }],
  },
  heavyPhosphorBlaster: {
    id: 'heavyPhosphorBlaster', name: tr('Heavy Phosphor Blaster'),
    profiles: [{ name: '', range: 36, attacks: 3, skill: 4, s: 6, ap: -1, d: 2, keywords: { ignoresCover: true } }],
  },
  kastelanPhosphorBlaster: {
    id: 'kastelanPhosphorBlaster', name: tr('Kastelan Phosphor Blaster'),
    profiles: [{ name: '', range: 24, attacks: 3, skill: 4, s: 6, ap: -1, d: 1, keywords: { ignoresCover: true } }],
  },
  twinKastelanPhosphorBlaster: {
    id: 'twinKastelanPhosphorBlaster', name: tr('Twin Kastelan Phosphor Blaster'),
    profiles: [{ name: '', range: 24, attacks: 3, skill: 4, s: 6, ap: -1, d: 1, keywords: { ignoresCover: true, twinLinked: true } }],
  },
  kastelanCCW: {
    id: 'kastelanCCW', name: tr('Close Combat Weapon'),
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 4, s: 6, ap: 0, d: 1, keywords: {} }],
  },
  kastelanFist: {
    id: 'kastelanFist', name: tr('Kastelan Fist'),
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 4, s: 12, ap: -2, d: 3, keywords: {} }],
  },
  twinKastelanFist: {
    id: 'twinKastelanFist', name: tr('Twin Kastelan Fist'),
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 4, s: 12, ap: -2, d: 3, keywords: { twinLinked: true } }],
  },
}

const skitarii = { m: 6, t: 3, sv: 4, w: 1, ld: 7, oc: 2, invuln: 5, baseMm: 25 }
const kataphron = { m: 5, sv: 3, w: 3, ld: 7, oc: 1, invuln: 6, baseMm: 60 }
const sicarian = { m: 8, t: 4, sv: 4, w: 2, ld: 7, oc: 1, invuln: 5, baseMm: 40 }
const kastelan = { m: 6, t: 9, sv: 2, w: 7, ld: 7, oc: 2, invuln: 5, baseMm: 60 }
/** Tech-Priest Dominus and Manipulus share their characteristics */
const dominus = { m: 6, t: 4, sv: 2, w: 4, ld: 7, oc: 1, invuln: 5, baseMm: 50, character: true }

export const MECHANICUS_PROFILES: Record<string, ModelProfile> = {
  techDominus: {
    id: 'techDominus', name: tr('Tech-Priest Dominus'), m: 6, t: 4, sv: 2, w: 4, ld: 7, oc: 1, invuln: 5, baseMm: 50, character: true,
    weapons: ['macrostubber', 'volkiteBlaster', 'omnissianAxe'],
  },
  techDominusSerpenta: { id: 'techDominusSerpenta', name: tr('Tech-Priest Dominus with phosphor serpenta'), ...dominus, weapons: ['phosphorSerpenta', 'volkiteBlaster', 'omnissianAxe'] },
  techDominusRay: { id: 'techDominusRay', name: tr('Tech-Priest Dominus with eradication ray'), ...dominus, weapons: ['macrostubber', 'eradicationRay', 'omnissianAxe'] },
  techDominusSerpentaRay: { id: 'techDominusSerpentaRay', name: tr('Tech-Priest Dominus with serpenta and ray'), ...dominus, weapons: ['phosphorSerpenta', 'eradicationRay', 'omnissianAxe'] },
  techManipulus: {
    id: 'techManipulus', name: tr('Tech-Priest Manipulus'), m: 6, t: 4, sv: 2, w: 4, ld: 7, oc: 1, invuln: 5, baseMm: 50, character: true,
    weapons: ['magnarailLance', 'omnissianStaff'],
  },
  techManipulusCannon: { id: 'techManipulusCannon', name: tr('Tech-Priest Manipulus with transonic cannon'), ...dominus, weapons: ['transonicCannon', 'omnissianStaff'] },
  // Rangers: precision rifles. Alpha has the optional Alpha combat weapon, one Ranger carries an Omnispex.
  rangerAlpha: { id: 'rangerAlpha', name: tr('Ranger Alpha'), ...skitarii, weapons: ['galvanicRifle', 'alphaCombatWeapon', 'skitariiCCW'] },
  ranger: { id: 'ranger', name: tr('Skitarii Ranger'), ...skitarii, weapons: ['galvanicRifle', 'skitariiCCW'] },
  rangerOmnispex: { id: 'rangerOmnispex', name: tr('Ranger with omnispex'), ...skitarii, wargear: ['omnispex'], weapons: ['galvanicRifle', 'skitariiCCW'] },
  rangerArc: { id: 'rangerArc', name: tr('Ranger with arc rifle'), ...skitarii, weapons: ['arcRifle', 'skitariiCCW'] },
  rangerCaliver: { id: 'rangerCaliver', name: tr('Ranger with plasma caliver'), ...skitarii, weapons: ['plasmaCaliver', 'skitariiCCW'] },
  // wargear options (11th edition): the Alpha may swap the rifle for a pistol; 1 Ranger may take a transuranic arquebus
  rangerAlphaPistol: { id: 'rangerAlphaPistol', name: tr('Ranger Alpha with pistol'), ...skitarii, weapons: ['mechanicusPistol', 'alphaCombatWeapon', 'skitariiCCW'] },
  rangerArquebus: { id: 'rangerArquebus', name: tr('Ranger with transuranic arquebus'), ...skitarii, weapons: ['transuranicArquebus', 'skitariiCCW'] },
  // Vanguard: radium carbines at close range.
  vanguardAlpha: { id: 'vanguardAlpha', name: tr('Vanguard Alpha'), ...skitarii, weapons: ['mechanicusPistol', 'alphaCombatWeapon', 'skitariiCCW'] },
  vanguard: { id: 'vanguard', name: tr('Skitarii Vanguard'), ...skitarii, weapons: ['radiumCarbine', 'skitariiCCW'] },
  vanguardArc: { id: 'vanguardArc', name: tr('Vanguard with arc rifle'), ...skitarii, weapons: ['arcRifle', 'skitariiCCW'] },
  vanguardCaliver: { id: 'vanguardCaliver', name: tr('Vanguard with plasma caliver'), ...skitarii, weapons: ['plasmaCaliver', 'skitariiCCW'] },
  vanguardAlphaCarbine: { id: 'vanguardAlphaCarbine', name: tr('Vanguard Alpha with carbine'), ...skitarii, weapons: ['radiumCarbine', 'alphaCombatWeapon', 'skitariiCCW'] },
  vanguardArquebus: { id: 'vanguardArquebus', name: tr('Vanguard with transuranic arquebus'), ...skitarii, weapons: ['transuranicArquebus', 'skitariiCCW'] },
  vanguardOmnispex: { id: 'vanguardOmnispex', name: tr('Vanguard with omnispex'), ...skitarii, wargear: ['omnispex'], weapons: ['radiumCarbine', 'skitariiCCW'] },
  // Kataphron: heavy cyborg platforms.
  breacher: { id: 'breacher', name: tr('Kataphron Breacher'), ...kataphron, t: 7, weapons: ['heavyArcRifle', 'arcClaw'] },
  breacherTorsion: { id: 'breacherTorsion', name: tr('Kataphron Breacher with torsion cannon'), ...kataphron, t: 7, weapons: ['torsionCannon', 'arcClaw'] },
  breacherHydraulic: { id: 'breacherHydraulic', name: tr('Kataphron Breacher with hydraulic claw'), ...kataphron, t: 7, weapons: ['heavyArcRifle', 'hydraulicClaw'] },
  breacherTorsionHydraulic: { id: 'breacherTorsionHydraulic', name: tr('Kataphron Breacher with torsion cannon and hydraulic claw'), ...kataphron, t: 7, weapons: ['torsionCannon', 'hydraulicClaw'] },
  destroyer: { id: 'destroyer', name: tr('Kataphron Destroyer'), ...kataphron, t: 6, weapons: ['heavyGravCannon', 'phosphorBlaster', 'kataphronCCW'] },
  destroyerCulverin: { id: 'destroyerCulverin', name: tr('Kataphron Destroyer with culverin'), ...kataphron, t: 6, weapons: ['plasmaCulverin', 'cognisFlamer', 'kataphronCCW'] },
  destroyerFlamer: { id: 'destroyerFlamer', name: tr('Kataphron Destroyer with grav-cannon and flamer'), ...kataphron, t: 6, weapons: ['heavyGravCannon', 'cognisFlamer', 'kataphronCCW'] },
  destroyerCulverinPhosphor: { id: 'destroyerCulverinPhosphor', name: tr('Kataphron Destroyer with culverin and phosphor blaster'), ...kataphron, t: 6, weapons: ['plasmaCulverin', 'phosphorBlaster', 'kataphronCCW'] },
  // Sicarian Infiltrators (the datasheet gives one profile for Princeps and troopers).
  sicarianPrinceps: { id: 'sicarianPrinceps', name: tr('Sicarian Princeps'), ...sicarian, weapons: ['stubcarbine', 'sicarianPowerWeapon'] },
  sicarian: { id: 'sicarian', name: tr('Sicarian Infiltrator'), ...sicarian, weapons: ['stubcarbine', 'sicarianPowerWeapon'] },
  sicarianTaser: { id: 'sicarianTaser', name: tr('Sicarian with taser goad'), ...sicarian, weapons: ['flechetteBlaster', 'taserGoad'] },
  // Kastelan Robots
  kastelan: { id: 'kastelan', name: tr('Kastelan with combustor'), ...kastelan, weapons: ['incendineCombustor', 'twinKastelanFist'] },
  kastelanGun: { id: 'kastelanGun', name: tr('Kastelan with phosphor blasters'), ...kastelan, weapons: ['heavyPhosphorBlaster', 'kastelanPhosphorBlaster', 'kastelanFist'] },
  // the other combinations of the two weapon options (combustor / heavy phosphor blaster x twin fist / blaster + fist / twin blaster + CCW)
  kastelanHeavyFists: { id: 'kastelanHeavyFists', name: tr('Kastelan with heavy blaster and twin fist'), ...kastelan, weapons: ['heavyPhosphorBlaster', 'twinKastelanFist'] },
  kastelanCombustorBlaster: { id: 'kastelanCombustorBlaster', name: tr('Kastelan with combustor and blaster'), ...kastelan, weapons: ['incendineCombustor', 'kastelanPhosphorBlaster', 'kastelanFist'] },
  kastelanCombustorTwin: { id: 'kastelanCombustorTwin', name: tr('Kastelan with combustor and twin blaster'), ...kastelan, weapons: ['incendineCombustor', 'twinKastelanPhosphorBlaster', 'kastelanCCW'] },
  kastelanHeavyTwin: { id: 'kastelanHeavyTwin', name: tr('Kastelan with heavy and twin blasters'), ...kastelan, weapons: ['heavyPhosphorBlaster', 'twinKastelanPhosphorBlaster', 'kastelanCCW'] },
}

const AM = 'ADEPTUS MECHANICUS'

export const MECHANICUS_DATASHEETS: Record<string, Datasheet> = {
  techDominus: {
    id: 'techDominus', name: tr('Tech-Priest Dominus|army'), faction: 'adeptus_mechanicus',
    keywords: ['INFANTRY', 'CHARACTER', 'IMPERIUM', 'CULT MECHANICUS', 'TECH-PRIEST', 'DOMINUS', AM],
    abilities: ['doctrina', 'lordOfMachineCult', 'dataSpike'],
    description: tr('Commander and battle priest: protects the led unit (Feel No Pain 5+), breaks enemy vehicles in melee.'),
  },
  techManipulus: {
    id: 'techManipulus', name: tr('Tech-Priest Manipulus|army'), faction: 'adeptus_mechanicus',
    keywords: ['INFANTRY', 'CHARACTER', 'IMPERIUM', 'CULT MECHANICUS', 'TECH-PRIEST', 'MANIPULUS', AM],
    abilities: ['doctrina', 'galvanicField', 'defendDivineWork'],
    description: tr('Fire support: the magnarail lance hits at 36″, and the led unit gets Lethal Hits and, once per battle, a 4+ invulnerable save.'),
  },
  rangers: {
    id: 'rangers', name: tr('Skitarii Rangers'), faction: 'adeptus_mechanicus',
    keywords: ['INFANTRY', 'BATTLELINE', 'IMPERIUM', 'SKITARII', 'RANGERS', AM],
    abilities: ['doctrina', 'ledUnit', 'objectiveScouted', 'scouts'],
    description: tr('Long-range line infantry: 30″ rifles, omnispex against cover, hold an objective even after leaving.'),
  },
  vanguard: {
    id: 'vanguard', name: tr('Skitarii Vanguard|alt'), faction: 'adeptus_mechanicus',
    keywords: ['INFANTRY', 'BATTLELINE', 'IMPERIUM', 'SKITARII', 'VANGUARD', AM],
    abilities: ['doctrina', 'ledUnit', 'radSaturation'],
    description: tr('Close-fire line infantry: radium carbines at 18″, radiation around the unit lowers enemy OC.'),
  },
  breachers: {
    id: 'breachers', name: tr('Kataphron Breachers'), faction: 'adeptus_mechanicus',
    keywords: ['INFANTRY', 'IMPERIUM', 'CULT MECHANICUS', 'KATAPHRON', 'BREACHERS', AM],
    abilities: ['doctrina', 'ledUnit', 'breachingCommand'],
    description: tr('Durable heavy fire support: T7, 3+ save, arc rifles against vehicles and claws in melee.'),
  },
  destroyers: {
    id: 'destroyers', name: tr('Kataphron Destroyers'), faction: 'adeptus_mechanicus',
    keywords: ['INFANTRY', 'IMPERIUM', 'CULT MECHANICUS', 'KATAPHRON', 'DESTROYERS', AM],
    abilities: ['doctrina', 'ledUnit', 'sentinelDirectives'],
    description: tr('Specialised long-range fire: grav-cannons and plasma culverins against heavy targets, phosphor ignores cover.'),
  },
  sicarians: {
    id: 'sicarians', name: tr('Sicarian Infiltrators'), faction: 'adeptus_mechanicus',
    keywords: ['INFANTRY', 'IMPERIUM', 'SKITARII', 'SICARIAN', 'INFILTRATORS', AM],
    abilities: ['doctrina', 'infiltrators', 'stealth', 'voicesInTheCode', 'neurostaticInterference'],
    description: tr('Mobile saboteurs: M8, stealth, tasers; sow panic and interfere with enemy Battle-shock tests.'),
  },
  kastelans: {
    id: 'kastelans', name: tr('Kastelan Robots'), faction: 'adeptus_mechanicus',
    keywords: ['VEHICLE', 'WALKER', 'IMPERIUM', 'LEGIO CYBERNETICA', 'KASTELAN ROBOTS', AM],
    abilities: ['doctrina', 'deadlyDemise1', 'repulsorGrid', 'roboticBodyguard'],
    description: tr('Heavy combat platforms: T9, 2+ save, phosphor blasters ignore cover, S12 fists; the return discharge hits shooters.'),
  },
}

export const MECHANICUS_ABILITY_TEXT: Record<string, string> = {
  doctrina: tr('Doctrina Imperatives (army rule): once per round choose Protector (Protector: ranged weapons get Heavy and BS 1 better; a BATTLELINE unit or one within 6″ of a friendly BATTLELINE gets −1 to be hit in melee) or Conqueror (Conqueror: ranged weapons get Assault, melee WS 1 better; for such a unit attacks’ AP is 1 better). [Approximation: chosen in your Command phase and lasts until your next Command phase.]'),
  ledUnit: tr('Can be led by a Tech-Priest (Leader): [Not implemented: leaders cannot join units. Approximation: a Tech-Priest within 3″ of the nearest such unit counts as leading it.]'),
  lordOfMachineCult: tr('Lord of the Machine Cult: the led unit’s models get Feel No Pain 5+ (a 5+ roll for each lost wound cancels it). [Approximation: the nearest friendly unit within 3″.]'),
  dataSpike: tr('Data-spike: at the start of the Fight phase, if the unit is in engagement range of an enemy VEHICLE, roll a D6: on a 4+ that vehicle takes D6 mortal wounds and the WS of its melee weapons is 1 worse until the end of the phase. [Triggers automatically.]'),
  galvanicField: tr('Galvanic Field: the weapons of the led unit’s models get Lethal Hits. [Approximation: the nearest friendly unit within 3″.]'),
  defendDivineWork: tr('Defend the Divine Work: once per battle — the led unit’s models get a 4+ invulnerable save. [Approximation: used in your phase and lasts until the start of your next turn.]'),
  objectiveScouted: tr('Objective Scouted: at the end of your Command phase, if the unit is near an objective you control, you hold it until the enemy’s control level becomes higher than yours.'),
  radSaturation: tr('Rad-saturation (3″ aura): models of enemy units (except VEHICLE) within 3″ of this unit lower their OC by 1.'),
  breachingCommand: tr('Breaching Command: each of the unit’s attacks re-rolls a hit roll of 1; within 6″ of a friendly BATTLELINE — re-rolls any hit roll.'),
  infiltrators: tr('Infiltrators: during deployment the unit can be placed anywhere more than 8″ from the deployment zone and enemy models.'),
  stealth: tr('Stealth: the unit always has cover against ranged attacks (−1 to BS).'),
  voicesInTheCode: tr('Voices in the Code: at the start of the Fight phase each enemy unit in engagement range takes a Battle-shock test.'),
  neurostaticInterference: tr('Neurostatic interference (6″ aura): Battle-shock and Ld tests of enemy units within 6″ get −1 (−2 if a friendly BATTLELINE is near).'),
  repulsorGrid: tr('Repulsor Grid: when the unit is shot at, each natural “6” on its save roll deals the shooter 1 mortal wound after the shot.'),
  sentinelDirectives: tr('Sentinel Directives: Fire Overwatch hits on 5+. [Not implemented: the simulator has no Stratagems or Fire Overwatch.]'),
  scouts: tr('Scouts 6″: pre-battle move of up to 6″. [Not implemented: there is no pre-battle movement.]'),
  roboticBodyguard: tr('Robotic Bodyguard: the Datasmith leading the unit gets Feel No Pain 4+. [Not implemented: the Cybernetica Datasmith is not in the roster.]'),
}
