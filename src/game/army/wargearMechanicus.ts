import type { WargearSpec } from './wargear'
import { tr } from '../../i18n/index'

// Adeptus Mechanicus wargear options, 11th edition datasheets (Wahapedia). Each variant is a model profile with that
// equipment (data/mechanicus.ts). Simplifications: the Alpha always carries the Alpha combat weapon (an optional extra on
// the datasheet), the enhanced data-tether is not offered (its effect is not in the game), and the Sicarian Princeps keeps
// the default weapons (the datasheet does not say whether it may swap).

const any = (size: number) => size

export const MECHANICUS_WARGEAR: Record<string, WargearSpec> = {
  techDominus: {
    leader: [
      { profile: 'techDominus', label: tr('Macrostubber and volkite blaster') },
      { profile: 'techDominusSerpenta', label: tr('Phosphor serpenta and volkite blaster') },
      { profile: 'techDominusRay', label: tr('Macrostubber and eradication ray') },
      { profile: 'techDominusSerpentaRay', label: tr('Phosphor serpenta and eradication ray') },
    ],
    base: { profile: 'techDominus', label: tr('Tech-Priest Dominus') },
    groups: [],
  },
  techManipulus: {
    leader: [
      { profile: 'techManipulus', label: tr('Magnarail lance') },
      { profile: 'techManipulusCannon', label: tr('Transonic cannon') },
    ],
    base: { profile: 'techManipulus', label: tr('Tech-Priest Manipulus') },
    groups: [],
  },
  rangers: {
    leader: [
      { profile: 'rangerAlpha', label: tr('Alpha: galvanic rifle') },
      { profile: 'rangerAlphaPistol', label: tr('Alpha: Mechanicus pistol') },
    ],
    base: { profile: 'ranger', label: tr('Galvanic rifle') },
    groups: [
      {
        id: 'special', label: tr('Special weapon — one per unit'),
        variants: [
          { profile: 'rangerArc', label: tr('Arc rifle') },
          { profile: 'rangerCaliver', label: tr('Plasma caliver') },
          { profile: 'rangerArquebus', label: tr('Transuranic arquebus') },
        ],
        max: () => 1,
      },
      { id: 'omnispex', label: tr('Omnispex — one model'), variants: [{ profile: 'rangerOmnispex', label: tr('Omnispex (the unit ignores cover)') }], max: () => 1 },
    ],
  },
  vanguard: {
    leader: [
      { profile: 'vanguardAlpha', label: tr('Alpha: Mechanicus pistol') },
      { profile: 'vanguardAlphaCarbine', label: tr('Alpha: radium carbine') },
    ],
    base: { profile: 'vanguard', label: tr('Radium carbine') },
    groups: [
      {
        id: 'special', label: tr('Special weapon — one of each kind'),
        variants: [
          { profile: 'vanguardArc', label: tr('Arc rifle') },
          { profile: 'vanguardCaliver', label: tr('Plasma caliver') },
          { profile: 'vanguardArquebus', label: tr('Transuranic arquebus') },
        ],
        max: () => 3,
        variantMax: { vanguardArc: 1, vanguardCaliver: 1, vanguardArquebus: 1 },
      },
      { id: 'omnispex', label: tr('Omnispex — one model'), variants: [{ profile: 'vanguardOmnispex', label: tr('Omnispex (the unit ignores cover)') }], max: () => 1 },
    ],
  },
  breachers: {
    base: { profile: 'breacher', label: tr('Heavy arc rifle and arc claw') },
    groups: [
      {
        id: 'arms', label: tr('Weapons — any number of models'),
        variants: [
          { profile: 'breacherTorsion', label: tr('Torsion cannon and arc claw') },
          { profile: 'breacherHydraulic', label: tr('Heavy arc rifle and hydraulic claw') },
          { profile: 'breacherTorsionHydraulic', label: tr('Torsion cannon and hydraulic claw') },
        ],
        max: any,
      },
    ],
  },
  destroyers: {
    base: { profile: 'destroyer', label: tr('Heavy gravitic cannon and phosphor blaster') },
    groups: [
      {
        id: 'arms', label: tr('Weapons — any number of models'),
        variants: [
          { profile: 'destroyerCulverin', label: tr('Plasma culverin and cognis flamer') },
          { profile: 'destroyerFlamer', label: tr('Heavy gravitic cannon and cognis flamer') },
          { profile: 'destroyerCulverinPhosphor', label: tr('Plasma culverin and phosphor blaster') },
        ],
        max: any,
      },
    ],
  },
  sicarians: {
    leader: [{ profile: 'sicarianPrinceps', label: tr('Princeps: stub carbine and power weapon') }],
    base: { profile: 'sicarian', label: tr('Stub carbine and power weapon') },
    groups: [
      { id: 'arms', label: tr('Flechette blaster and taser goad — any number of models'), variants: [{ profile: 'sicarianTaser', label: tr('Flechette blaster and taser goad') }], max: (size) => size - 1 },
    ],
  },
  kastelans: {
    base: { profile: 'kastelan', label: tr('Combustor and twin fist') },
    groups: [
      {
        id: 'arms', label: tr('Weapons — any number of models'),
        variants: [
          { profile: 'kastelanGun', label: tr('Heavy phosphor blaster, phosphor blaster and fist') },
          { profile: 'kastelanHeavyFists', label: tr('Heavy phosphor blaster and twin fist') },
          { profile: 'kastelanCombustorBlaster', label: tr('Combustor, phosphor blaster and fist') },
          { profile: 'kastelanCombustorTwin', label: tr('Combustor and twin phosphor blaster') },
          { profile: 'kastelanHeavyTwin', label: tr('Heavy and twin phosphor blasters') },
        ],
        max: any,
      },
    ],
  },
  sulphurhounds: {
    leader: [{ profile: 'sulphurhoundAlpha', label: tr('Alpha: Mechanicus pistol, breath, arc maul') }],
    base: { profile: 'sulphurhound', label: tr('2 phosphor pistols and sulphur breath') },
    groups: [
      { id: 'arms', label: tr('Phosphor blast carbine — one model per 3'), variants: [{ profile: 'sulphurhoundCarbine', label: tr('Blast carbine and phosphor pistol') }], max: (size) => Math.floor(size / 3) },
    ],
  },
  ironstriders: {
    base: { profile: 'ironstrider', label: tr('Twin cognis autocannon') },
    groups: [
      { id: 'arms', label: tr('Lascannon instead of autocannon — any number of models'), variants: [{ profile: 'ironstriderLascannon', label: tr('Twin cognis lascannon') }], max: any },
    ],
  },
  onager: {
    base: { profile: 'onager', label: tr('Eradication beamer') },
    groups: [
      {
        id: 'arms', label: tr('Main weapon'),
        variants: [
          { profile: 'onagerMissiles', label: tr('Daedalus missile launcher and Icarus array') },
          { profile: 'onagerNeutron', label: tr('Neutron laser and heavy stubber') },
          { profile: 'onagerPhosphor', label: tr('Twin heavy phosphor blaster') },
        ],
        max: () => 1,
      },
    ],
  },
}
