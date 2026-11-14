import type { Datasheet, ModelProfile, Weapon } from '../types'
import { tr } from '../../i18n/index'

// Adeptus Mechanicus, 11th-edition datasheets as transcribed by Wahapedia (checked 2026-11-09):
//   Tech-Priest Dominus, Tech-Priest Manipulus, Skitarii Rangers, Skitarii Vanguard, Kataphron Breachers,
//   Kataphron Destroyers, Sicarian Infiltrators, Kastelan Robots; and (checked 2026-11-12) Serberys Sulphurhounds,
//   Ironstrider Ballistarii, Onager Dunecrawler, Corpuscarii Electro-Priests. See docs/mechanicus.md.

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
  // ---- Serberys Sulphurhounds
  sulphurBreath: {
    id: 'sulphurBreath', name: tr('Sulphur Breath'),
    profiles: [{ name: '', range: 9, attacks: 0, randomA: 'D6', skill: null, s: 3, ap: -1, d: 1, keywords: { closeQuarters: true, ignoresCover: true, torrent: true } }],
  },
  phosphorPistols: {
    id: 'phosphorPistols', name: tr('Phosphor Pistols'),
    profiles: [{ name: '', range: 12, attacks: 2, skill: 4, s: 4, ap: 0, d: 1, keywords: { closeQuarters: true, ignoresCover: true } }],
  },
  phosphorPistol: {
    id: 'phosphorPistol', name: tr('Phosphor Pistol'),
    profiles: [{ name: '', range: 12, attacks: 1, skill: 4, s: 4, ap: 0, d: 1, keywords: { closeQuarters: true, ignoresCover: true } }],
  },
  phosphorBlastCarbine: {
    id: 'phosphorBlastCarbine', name: tr('Phosphor Blast Carbine'),
    profiles: [{ name: '', range: 18, attacks: 0, randomA: 'D6', skill: 4, s: 6, ap: 0, d: 1, keywords: { blast: 1, ignoresCover: true } }],
  },
  cavalryArcMaul: {
    id: 'cavalryArcMaul', name: tr('Cavalry Arc Maul'),
    profiles: [{ name: '', range: 'melee', attacks: 1, skill: 4, s: 5, ap: -1, d: 1, keywords: { anti: anti('VEHICLE', 4), devastatingWounds: true, extraAttacks: true } }],
  },
  clawedLimbs: {
    id: 'clawedLimbs', name: tr('Clawed Limbs'),
    profiles: [{ name: '', range: 'melee', attacks: 4, skill: 4, s: 4, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Ironstrider Ballistarii
  twinCognisAutocannon: {
    id: 'twinCognisAutocannon', name: tr('Twin Cognis Autocannon'),
    profiles: [{ name: '', range: 48, attacks: 4, skill: 4, s: 9, ap: -1, d: 3, keywords: { sustainedHits: 1, twinLinked: true } }],
  },
  twinCognisLascannon: {
    id: 'twinCognisLascannon', name: tr('Twin Cognis Lascannon'),
    profiles: [{ name: '', range: 48, attacks: 2, skill: 4, s: 12, ap: -3, d: 1, randomD: 'D6', keywords: { sustainedHits: 1, twinLinked: true } }],
  },
  ironstriderFeet: {
    id: 'ironstriderFeet', name: tr('Ironstrider Feet'),
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 4, s: 5, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Onager Dunecrawler
  eradicationBeamer: {
    id: 'eradicationBeamer', name: tr('Onager Eradication Beamer'),
    profiles: [
      { name: tr('Dissipated'), range: 36, attacks: 0, randomA: '3D3', skill: 4, s: 9, ap: -2, d: 2, keywords: { blast: 1, sustainedHits: 1 } },
      { name: tr('Focused'), range: 18, attacks: 0, randomA: '3D3', skill: 4, s: 10, ap: -3, d: 3, keywords: { blast: 1, sustainedHits: 1 } },
    ],
  },
  cognisHeavyStubber: {
    id: 'cognisHeavyStubber', name: tr('Cognis Heavy Stubber'),
    profiles: [{ name: '', range: 36, attacks: 3, skill: 4, s: 4, ap: 0, d: 1, keywords: { rapidFire: 3, sustainedHits: 1 } }],
  },
  daedalusMissileLauncher: {
    id: 'daedalusMissileLauncher', name: tr('Daedalus Missile Launcher'),
    profiles: [{ name: '', range: 48, attacks: 2, skill: 4, s: 10, ap: -2, d: 1, randomD: 'D6', keywords: { anti: anti('FLY', 2) } }],
  },
  neutronLaser: {
    id: 'neutronLaser', name: tr('Neutron Laser'),
    profiles: [{ name: '', range: 48, attacks: 3, skill: 4, s: 16, ap: -4, d: 2, randomD: 'D6', keywords: { heavy: true } }],
  },
  icarusArray: {
    id: 'icarusArray', name: tr('Icarus Array'),
    profiles: [{ name: '', range: 48, attacks: 6, skill: 4, s: 8, ap: -1, d: 2, keywords: { anti: anti('FLY', 4), twinLinked: true } }],
  },
  twinOnagerPhosphor: {
    id: 'twinOnagerPhosphor', name: tr('Twin Onager Heavy Phosphor Blaster'),
    profiles: [{ name: '', range: 36, attacks: 12, skill: 4, s: 6, ap: -1, d: 2, keywords: { ignoresCover: true, twinLinked: true } }],
  },
  dunecrawlerLegs: {
    id: 'dunecrawlerLegs', name: tr('Dunecrawler Legs'),
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 4, s: 6, ap: 0, d: 1, keywords: {} }],
  },
  // ---- Corpuscarii Electro-Priests
  electrostaticGauntletsRanged: {
    id: 'electrostaticGauntletsRanged', name: tr('Electrostatic Gauntlets (shooting)'),
    profiles: [{ name: '', range: 12, attacks: 3, skill: 3, s: 5, ap: 0, d: 1, keywords: { closeQuarters: true, sustainedHits: 2 } }],
  },
  electrostaticGauntlets: {
    id: 'electrostaticGauntlets', name: tr('Electrostatic Gauntlets'),
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 4, s: 5, ap: 0, d: 1, keywords: { sustainedHits: 2 } }],
  },
  // ---- Skorpius Dunerider
  cognisHeavyStubberArray: {
    id: 'cognisHeavyStubberArray', name: tr('Cognis Heavy Stubber Array'),
    profiles: [{ name: '', range: 36, attacks: 9, skill: 4, s: 4, ap: 0, d: 1, keywords: { rapidFire: 9, sustainedHits: 1, twinLinked: true } }],
  },
  armouredHull: {
    id: 'armouredHull', name: tr('Armoured Hull'),
    profiles: [{ name: '', range: 'melee', attacks: 3, skill: 4, s: 6, ap: 0, d: 1, keywords: {} }],
  },
}

const skitarii = { m: 6, t: 3, sv: 4, w: 1, ld: 7, oc: 2, invuln: 5, baseMm: 25 }
const kataphron = { m: 5, sv: 3, w: 3, ld: 7, oc: 1, invuln: 6, baseMm: 60 }
const sicarian = { m: 8, t: 4, sv: 4, w: 2, ld: 7, oc: 1, invuln: 5, baseMm: 40 }
const kastelan = { m: 6, t: 9, sv: 2, w: 7, ld: 7, oc: 2, invuln: 5, baseMm: 60 }
const sulphurhound = { m: 12, t: 4, sv: 4, w: 2, ld: 7, oc: 2, invuln: 5, baseMm: 50 }
const ironstrider = { m: 10, t: 7, sv: 3, w: 7, ld: 7, oc: 2, invuln: 5, baseMm: 90 }
const onager = { m: 8, t: 10, sv: 2, w: 11, ld: 7, oc: 3, invuln: 4, baseMm: 130 }
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
  // Serberys Sulphurhounds (the oval 60x35.5 mm base is drawn as a 50 mm round one)
  sulphurhoundAlpha: { id: 'sulphurhoundAlpha', name: tr('Sulphurhound Alpha'), ...sulphurhound, weapons: ['mechanicusPistol', 'sulphurBreath', 'cavalryArcMaul', 'clawedLimbs'] },
  sulphurhound: { id: 'sulphurhound', name: tr('Serberys Sulphurhound'), ...sulphurhound, weapons: ['phosphorPistols', 'sulphurBreath', 'clawedLimbs'] },
  sulphurhoundCarbine: { id: 'sulphurhoundCarbine', name: tr('Sulphurhound with blast carbine'), ...sulphurhound, weapons: ['phosphorBlastCarbine', 'phosphorPistol', 'sulphurBreath', 'clawedLimbs'] },
  // Ironstrider Ballistarii (the oval 105x70 mm base is drawn as a 90 mm round one)
  ironstrider: { id: 'ironstrider', name: tr('Ironstrider with autocannon'), ...ironstrider, weapons: ['twinCognisAutocannon', 'ironstriderFeet'] },
  ironstriderLascannon: { id: 'ironstriderLascannon', name: tr('Ironstrider with lascannon'), ...ironstrider, weapons: ['twinCognisLascannon', 'ironstriderFeet'] },
  // Onager Dunecrawler: one model, four main weapon options
  onager: { id: 'onager', name: tr('Onager with eradication beamer'), ...onager, weapons: ['eradicationBeamer', 'dunecrawlerLegs'] },
  onagerMissiles: { id: 'onagerMissiles', name: tr('Onager with Daedalus and Icarus'), ...onager, weapons: ['daedalusMissileLauncher', 'icarusArray', 'dunecrawlerLegs'] },
  onagerNeutron: { id: 'onagerNeutron', name: tr('Onager with neutron laser'), ...onager, weapons: ['neutronLaser', 'cognisHeavyStubber', 'dunecrawlerLegs'] },
  onagerPhosphor: { id: 'onagerPhosphor', name: tr('Onager with phosphor blaster'), ...onager, weapons: ['twinOnagerPhosphor', 'dunecrawlerLegs'] },
  // Corpuscarii Electro-Priests
  // Skorpius Dunerider: a FRAME vehicle without a base, drawn as a round 105 mm one
  dunerider: { id: 'dunerider', name: tr('Skorpius Dunerider'), m: 12, t: 9, sv: 3, w: 11, ld: 7, oc: 2, baseMm: 105, weapons: ['cognisHeavyStubberArray', 'armouredHull'] },
  electroPriest: { id: 'electroPriest', name: tr('Corpuscarii Electro-Priest'), m: 6, t: 3, sv: 7, w: 1, ld: 7, oc: 1, invuln: 5, baseMm: 32, weapons: ['electrostaticGauntletsRanged', 'electrostaticGauntlets'] },
}

const AM = 'ADEPTUS MECHANICUS'
/** Leader (Tech-Priest Dominus, Manipulus): the units of the game from the datasheet's list */
const TECH_PRIEST_LEADS = ['rangers', 'vanguard', 'breachers', 'destroyers', 'electroPriests']

export const MECHANICUS_DATASHEETS: Record<string, Datasheet> = {
  techDominus: {
    id: 'techDominus', name: tr('Tech-Priest Dominus|army'), faction: 'adeptus_mechanicus',
    keywords: ['INFANTRY', 'CHARACTER', 'IMPERIUM', 'CULT MECHANICUS', 'TECH-PRIEST', 'DOMINUS', AM],
    abilities: ['doctrina', 'lordOfMachineCult', 'dataSpike'],
    leads: TECH_PRIEST_LEADS,
    description: tr('Commander and battle priest: protects the led unit (Feel No Pain 5+), breaks enemy vehicles in melee.'),
  },
  techManipulus: {
    id: 'techManipulus', name: tr('Tech-Priest Manipulus|army'), faction: 'adeptus_mechanicus',
    keywords: ['INFANTRY', 'CHARACTER', 'IMPERIUM', 'CULT MECHANICUS', 'TECH-PRIEST', 'MANIPULUS', AM],
    abilities: ['doctrina', 'galvanicField', 'defendDivineWork'],
    leads: TECH_PRIEST_LEADS,
    description: tr('Fire support: the magnarail lance hits at 36″, and the led unit gets Lethal Hits and, once per battle, a 4+ invulnerable save.'),
  },
  rangers: {
    id: 'rangers', name: tr('Skitarii Rangers'), faction: 'adeptus_mechanicus',
    keywords: ['INFANTRY', 'BATTLELINE', 'IMPERIUM', 'SKITARII', 'RANGERS', AM],
    abilities: ['doctrina', 'objectiveScouted', 'scouts'],
    description: tr('Long-range line infantry: 30″ rifles, omnispex against cover, hold an objective even after leaving.'),
  },
  vanguard: {
    id: 'vanguard', name: tr('Skitarii Vanguard|alt'), faction: 'adeptus_mechanicus',
    keywords: ['INFANTRY', 'BATTLELINE', 'IMPERIUM', 'SKITARII', 'VANGUARD', AM],
    abilities: ['doctrina', 'radSaturation'],
    description: tr('Close-fire line infantry: radium carbines at 18″, radiation around the unit lowers enemy OC.'),
  },
  breachers: {
    id: 'breachers', name: tr('Kataphron Breachers'), faction: 'adeptus_mechanicus',
    keywords: ['INFANTRY', 'IMPERIUM', 'CULT MECHANICUS', 'KATAPHRON', 'BREACHERS', AM],
    abilities: ['doctrina', 'breachingCommand'],
    description: tr('Durable heavy fire support: T7, 3+ save, arc rifles against vehicles and claws in melee.'),
  },
  destroyers: {
    id: 'destroyers', name: tr('Kataphron Destroyers'), faction: 'adeptus_mechanicus',
    keywords: ['INFANTRY', 'IMPERIUM', 'CULT MECHANICUS', 'KATAPHRON', 'DESTROYERS', AM],
    abilities: ['doctrina', 'sentinelDirectives'],
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
  sulphurhounds: {
    id: 'sulphurhounds', name: tr('Serberys Sulphurhounds'), faction: 'adeptus_mechanicus',
    keywords: ['MOUNTED', 'IMPERIUM', 'SKITARII', 'SERBERYS SULPHURHOUNDS', AM],
    abilities: ['doctrina', 'lineBreakers'],
    description: tr('Fast cavalry: M12″, sulphur breath and phosphor pistols at point-blank range; crashing into the enemy line, they deal mortal wounds.'),
  },
  ironstriders: {
    id: 'ironstriders', name: tr('Ironstrider Ballistarii'), faction: 'adeptus_mechanicus',
    keywords: ['VEHICLE', 'WALKER', 'SMOKE', 'IMPERIUM', 'SKITARII', 'IRONSTRIDER BALLISTARII', AM],
    abilities: ['doctrina', 'deadlyDemise1', 'elevatedStrider', 'dataTether'],
    description: tr('Mobile vehicle hunters: M10″, autocannons or lascannons at 48″, they shoot even after advancing and falling back.'),
  },
  onager: {
    id: 'onager', name: tr('Onager Dunecrawler'), faction: 'adeptus_mechanicus',
    keywords: ['VEHICLE', 'WALKER', 'IMPERIUM', 'SKITARII', 'SMOKE', 'ONAGER DUNECRAWLER', AM],
    abilities: ['doctrina', 'deadlyDemiseD3', 'emanatusForceField', 'scuttlingWalker', 'damaged1to4'],
    description: tr('A heavy support walker: T10, 2+ save and 4+ invulnerable, a swappable main weapon at 36–48″; its force field covers the line infantry nearby.'),
  },
  electroPriests: {
    id: 'electroPriests', name: tr('Corpuscarii Electro-Priests'), faction: 'adeptus_mechanicus',
    keywords: ['INFANTRY', 'IMPERIUM', 'CULT MECHANICUS', 'CORPUSCARII', 'ELECTRO-PRIESTS', AM],
    abilities: ['doctrina', 'feelNoPain5', 'electroShock'],
    description: tr('Fanatics with lightning in their hands: gauntlets at 12″ and in melee with Sustained Hits 2; the discharge slows enemy infantry.'),
  },
  dunerider: {
    id: 'dunerider', name: tr('Skorpius Dunerider'), faction: 'adeptus_mechanicus',
    keywords: ['VEHICLE', 'TRANSPORT', 'DEDICATED TRANSPORT', 'IMPERIUM', 'FRAME', 'SKITARII', 'SMOKE', 'SKORPIUS DUNERIDER', AM],
    abilities: ['doctrina', 'deadlyDemiseD3', 'firingDeck', 'dataTether', 'fireSupport'],
    description: tr('Skimmer transport: carries up to 12 Mechanicus infantry fast (M12″); two passengers shoot from its Firing Deck.'),
    transport: { capacity: 12, keywords: ['INFANTRY', AM], exclude: ['JUMP PACK', 'KATAPHRON', 'SYDONIAN SKATROS'], label: tr('Adeptus Mechanicus INFANTRY (no Kataphrons)'), firingDeck: 2 },
  },
}

export const MECHANICUS_ABILITY_TEXT: Record<string, string> = {
  doctrina: tr('Doctrina Imperatives (army rule): once per round choose Protector (Protector: ranged weapons get Heavy and BS 1 better; a BATTLELINE unit or one within 6″ of a friendly BATTLELINE gets −1 to be hit in melee) or Conqueror (Conqueror: ranged weapons get Assault, melee WS 1 better; for such a unit attacks’ AP is 1 better). [Approximation: chosen in your Command phase and lasts until your next Command phase.]'),
  lordOfMachineCult: tr('Lord of the Machine Cult: while this model leads a unit, its models get Feel No Pain 5+, or 4+ for Electro-Priests (a roll for each lost wound cancels it).'),
  dataSpike: tr('Data-spike: at the start of the Fight phase, if the unit is in engagement range of an enemy VEHICLE, roll a D6: on a 4+ that vehicle takes D6 mortal wounds and the WS of its melee weapons is 1 worse until the end of the phase. [Triggers automatically.]'),
  galvanicField: tr('Galvanic Field: while this model leads a unit, the weapons of its models get Lethal Hits.'),
  defendDivineWork: tr('Defend the Divine Work: once per battle — every model of this model’s unit gets a 4+ invulnerable save. [Approximation: used in your phase and lasts until the start of your next turn.]'),
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
  lineBreakers: tr('Line-breakers: when the unit ends a charge move, pick an enemy in engagement range and roll a D6 for each of its models in contact with it; +2 to the roll if the charge started within 6″ of a friendly Adeptus Mechanicus BATTLELINE unit. Each 4+ is a mortal wound.'),
  elevatedStrider: tr('Elevated Strider: the unit can shoot in a turn when it Advanced or fell back. [Re-rolling Desperate Escape tests is not needed: the game has none.]'),
  firingDeck: tr('Firing Deck X: when this transport shoots, up to X embarked models each fire one ranged weapon with it, measured from the transport (Dunerider and Rhino 2, Battlewagon 11, Trukk 12).'),
  fireSupport: tr('Fire Support: after this transport shoots, units that disembarked from it this turn may re-roll wound rolls against a unit it hit. [Not implemented yet.]'),
  dataTether: tr('Broad Spectrum Data-tether: when a Stratagem is used on this unit, roll a D6; on a 5+ you get 1 CP.'),
  emanatusForceField: tr('Emanatus Force Field (6″ aura): each friendly Adeptus Mechanicus BATTLELINE model wholly within 6″ gets a 4+ invulnerable save against ranged attacks.'),
  scuttlingWalker: tr('Scuttling Walker: when making a Normal move, Advancing or falling back, it can move through friendly Monsters and Vehicles and through terrain up to 4″ high. [Not implemented: the game has no terrain heights.]'),
  damaged1to4: tr('Damaged (1–4 wounds): while the model has 4 wounds or fewer left, −1 to its hit rolls.'),
  feelNoPain5: tr('Feel No Pain 5+: the model cancels each lost wound on a 5+.'),
  electroShock: tr('Electro-shock: after shooting in your phase, pick an enemy unit (not MONSTER or VEHICLE) that was hit: until the end of the opponent’s next turn −2″ to its move and −2 to its Advance and Charge rolls. [The target of the shooting is chosen.]'),
  roboticBodyguard: tr('Robotic Bodyguard: the Datasmith leading the unit gets Feel No Pain 4+. [Not implemented: the Cybernetica Datasmith is not in the roster.]'),
}
