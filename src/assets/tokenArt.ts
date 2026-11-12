import { VARIANT_FROM } from '../game/data/wargearExtra'
// Original blueprint-style tokens: a top-down technical drawing of each model
// on its base (no Games Workshop artwork). 100×100, ALL art faces +x; the board
// flips the built-in portraits of the army that stands on the east side so both
// armies face each other. The board clips them to the base.

export const BLUEPRINT_LINE = {
  marines: '#8fd3ff',
  orks: '#b9e66b',
  tyranids: '#ff7a8a',
  necrons: '#e6eef7',
  aeldari: '#c79bff',
  adeptus_mechanicus: '#f0b24a',
} as const
const PAPER = '#0a1f3a'

/** Shared base: rim, inch-style ticks, facing arrow. */
function base(c: string, figure: string, mirror: boolean): string {
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2
    const r0 = i % 6 === 0 ? 40 : 43
    return `<line x1="${50 + Math.cos(a) * r0}" y1="${50 + Math.sin(a) * r0}" x2="${50 + Math.cos(a) * 46}" y2="${50 + Math.sin(a) * 46}"/>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="49" fill="${PAPER}"/>
  <g stroke="${c}" fill="none" opacity="0.18" stroke-width="0.5"><line x1="4" y1="50" x2="96" y2="50"/><line x1="50" y1="4" x2="50" y2="96"/><circle cx="50" cy="50" r="30"/></g>
  <g stroke="${c}" stroke-width="0.9" opacity="0.7">${ticks}</g>
  <circle cx="50" cy="50" r="46.5" fill="none" stroke="${c}" stroke-width="3.2"/>
  <g transform="${mirror ? 'translate(100 0) scale(-1 1)' : ''}" stroke="${c}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M91 45 L98 50 L91 55 Z" fill="${c}" stroke="none"/>
    ${figure}
  </g>
</svg>`
}

const f = (c: string, o = 0.22) => `fill="${c}" fill-opacity="${o}"`

// ---------------------------------------------------------------- Space Marines

type MarineGear = 'rifle' | 'rifleGL' | 'swordPistol' | 'chainPistol' | 'bolterSword' | 'plasma' | 'pyre' | 'swordShield'

function marine(gear: MarineGear, opts: { sergeant?: boolean; officer?: boolean } = {}): string {
  const c = BLUEPRINT_LINE.marines
  const cape = opts.officer
    ? `<path d="M40 22 Q16 30 14 50 Q16 70 40 78" ${f(c, 0.08)} stroke-dasharray="3 2"/>`
    : ''
  const backpack = `<rect x="23" y="37" width="13" height="26" rx="3" ${f(c)}/><circle cx="27" cy="42" r="2.6" ${f(c, 0.3)}/><circle cx="27" cy="58" r="2.6" ${f(c, 0.3)}/>`
  const torso = `<ellipse cx="47" cy="50" rx="14" ry="19" ${f(c)}/><line x1="40" y1="50" x2="54" y2="50" opacity="0.5"/>`
  const pauldron = (y: number) => `<circle cx="45" cy="${y}" r="11" ${f(c, 0.2)}/><circle cx="45" cy="${y}" r="7" fill="none" stroke-dasharray="2 1.5" opacity="0.7"/>`
  const chevron = opts.sergeant ? `<path d="M40 28 L45 33 L50 28" fill="none" stroke-width="1.8"/>` : ''
  const head = `<circle cx="56" cy="50" r="7.5" ${f(c, 0.25)}/><line x1="61.5" y1="46" x2="61.5" y2="54" stroke-width="2.4"/>`
    + (opts.sergeant ? `<line x1="49" y1="50" x2="63" y2="50" stroke-width="2.2"/>` : '')
    + (opts.officer ? `<line x1="47" y1="50" x2="64" y2="50" stroke-width="3.2"/><path d="M50 40 Q57 37 63 42 M50 60 Q57 63 63 58" fill="none" stroke-dasharray="2 1.5"/>` : '')
  const rifle = `<rect x="55" y="55" width="34" height="6" rx="1.5" ${f(c, 0.3)}/><rect x="64" y="51.5" width="9" height="3.5" ${f(c, 0.3)}/><rect x="67" y="61" width="4.5" height="6" ${f(c, 0.3)}/>`
  const gl = `<rect x="58" y="63" width="21" height="7.5" rx="3.5" ${f(c, 0.3)}/><circle cx="79" cy="66.75" r="3.8" ${f(c, 0.4)}/>`
  const sword = `<line x1="54" y1="32" x2="90" y2="22" stroke-width="2.6"/><line x1="55" y1="27" x2="58" y2="37" stroke-width="2"/>`
  const pistol = `<rect x="57" y="61" width="15" height="5" rx="1.5" ${f(c, 0.3)}/>`
  const chainsword = `<line x1="54" y1="32" x2="86" y2="24" stroke-width="4"/><line x1="58" y1="31" x2="84" y2="24.5" stroke-width="1" stroke-dasharray="1.5 1.5" stroke="${PAPER}"/>`
  // plasma incinerator: a long barrel with coolant rings; pyreblaster: a short nozzle fed by a fuel line
  const plasma = `<rect x="55" y="55" width="36" height="7" rx="2" ${f(c, 0.3)}/><circle cx="66" cy="58.5" r="4.2" ${f(c, 0.45)}/><circle cx="76" cy="58.5" r="4.2" ${f(c, 0.45)}/><line x1="88" y1="58.5" x2="94" y2="58.5" stroke-width="2.8"/>`
  const pyre = `<rect x="55" y="55" width="26" height="8" rx="3" ${f(c, 0.3)}/><path d="M81 54 L92 51 L92 67 L81 64 Z" ${f(c, 0.45)}/><path d="M36 62 Q44 72 58 64" fill="none" stroke-dasharray="2 1.5"/>`
  const shield = `<path d="M52 60 L70 58 L72 72 L60 80 L50 72 Z" ${f(c, 0.35)}/><line x1="60" y1="62" x2="61" y2="76" opacity="0.7"/>`
  const weapon = {
    rifle, rifleGL: rifle + gl, swordPistol: sword + pistol, chainPistol: chainsword + pistol,
    bolterSword: sword + rifle, plasma, pyre, swordShield: sword + shield,
  }[gear]
  return base(c, cape + backpack + torso + pauldron(30) + pauldron(70) + chevron + head + weapon, false)
}

// ---------------------------------------------------------------- vehicles

/** Redemptor Dreadnought from above: sarcophagus hull, fist arm, macro plasma arm, shoulder launchers. */
function redemptor(): string {
  const c = BLUEPRINT_LINE.marines
  return base(c, `
    <rect x="20" y="30" width="14" height="12" rx="3" ${f(c, 0.15)}/><rect x="20" y="58" width="14" height="12" rx="3" ${f(c, 0.15)}/>
    <rect x="28" y="26" width="38" height="48" rx="9" ${f(c)}/>
    <line x1="34" y1="34" x2="34" y2="66" opacity="0.6"/><line x1="40" y1="34" x2="40" y2="66" opacity="0.6"/>
    <rect x="46" y="38" width="14" height="24" rx="3" ${f(c, 0.3)}/>
    <rect x="60" y="43" width="11" height="14" rx="3" ${f(c, 0.35)}/><line x1="68" y1="46" x2="68" y2="54" stroke-width="2.6"/>
    <rect x="33" y="28" width="9" height="7" ${f(c, 0.35)}/><rect x="33" y="65" width="9" height="7" ${f(c, 0.35)}/>
    <rect x="42" y="12" width="20" height="12" rx="3" ${f(c, 0.25)}/>
    <rect x="60" y="9" width="16" height="18" rx="3" ${f(c, 0.35)}/><line x1="64" y1="11" x2="64" y2="25" opacity="0.7"/><line x1="68" y1="11" x2="68" y2="25" opacity="0.7"/><line x1="72" y1="11" x2="72" y2="25" opacity="0.7"/>
    <rect x="42" y="74" width="20" height="14" rx="3" ${f(c, 0.25)}/>
    <rect x="60" y="76" width="31" height="9" rx="2" ${f(c, 0.3)}/><circle cx="66" cy="80.5" r="3" fill="none"/><circle cx="74" cy="80.5" r="3" fill="none"/>
    <rect x="70" y="58" width="13" height="5" rx="2" ${f(c, 0.4)}/>
  `, false)
}

/** Deff Dread from above: riveted barrel body, pilot hatch, klaw, big shoota, skorcha, exhaust stacks. */
function deffDread(): string {
  const c = BLUEPRINT_LINE.orks
  const rivets = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2
    return `<circle cx="${46 + Math.cos(a) * 17}" cy="${50 + Math.sin(a) * 17}" r="1.1" fill="${c}" stroke="none"/>`
  }).join('')
  return base(c, `
    <circle cx="24" cy="38" r="4.5" ${f(c, 0.3)}/><circle cx="24" cy="62" r="4.5" ${f(c, 0.3)}/>
    <circle cx="46" cy="50" r="21" ${f(c)}/>${rivets}
    <circle cx="48" cy="50" r="9" ${f(c, 0.3)}/><line x1="44" y1="50" x2="54" y2="50"/>
    <path d="M52 32 L66 22 L72 26 L60 36 Z" ${f(c, 0.25)}/>
    <path d="M70 20 L86 14 L82 20 L90 22 L80 27 L72 26 Z" ${f(c, 0.4)}/>
    <path d="M52 68 L64 76 L60 80 L50 74 Z" ${f(c, 0.25)}/>
    <rect x="60" y="74" width="30" height="9" rx="2" ${f(c, 0.3)}/><line x1="82" y1="76.5" x2="93" y2="76.5"/><line x1="82" y1="80.5" x2="93" y2="80.5"/>
    <rect x="64" y="46" width="14" height="8" rx="3" ${f(c, 0.35)}/><path d="M78 46 L86 43 L86 57 L78 54 Z" ${f(c, 0.5)}/>
  `, false)
}

// ---------------------------------------------------------------- Orks

type OrkGear = 'sluggaChoppa' | 'bigShoota' | 'rokkit' | 'bigChoppa' | 'kustomChoppa' | 'krumpa'

/** `nob`: bigger, with shoulder spikes; `boss`: bigger still, with a horned helmet; `kommando`: a bandana and a knife. */
function ork(gear: OrkGear, opts: { nob?: boolean; boss?: boolean; kommando?: boolean } = {}): string {
  const c = BLUEPRINT_LINE.orks
  const k = opts.boss ? 1.22 : opts.nob ? 1.12 : 1
  const plate = (y: number, s: number) => `<path d="M34 ${y - 9 * s} L50 ${y - 12 * s} L56 ${y - 2 * s} L52 ${y + 9 * s} L36 ${y + 10 * s} L30 ${y} Z" ${f(c, 0.2)}/><line x1="38" y1="${y - 4 * s}" x2="48" y2="${y + 4 * s}" opacity="0.6"/>`
  const body = `<g transform="translate(46 50) scale(${k}) translate(-46 -50)">
    <ellipse cx="44" cy="50" rx="16" ry="21" ${f(c)}/>
    ${plate(29, 1)}${plate(71, -1)}
    <circle cx="61" cy="50" r="8.5" ${f(c, 0.25)}/>
    <path d="M67 45.5 L71 44 L68.5 48 Z M67 54.5 L71 56 L68.5 52 Z" fill="${c}" stroke="none"/>
    <circle cx="64" cy="47" r="1.2" fill="${c}" stroke="none"/><circle cx="64" cy="53" r="1.2" fill="${c}" stroke="none"/>
    ${opts.nob || opts.boss ? `<path d="M56 42 L50 33 L60 41 Z M56 58 L50 67 L60 59 Z" ${f(c, 0.5)}/><circle cx="44" cy="50" r="27" fill="none" stroke-dasharray="1.5 3" opacity="0.6"/>` : ''}
    ${opts.boss ? `<path d="M58 42 L52 30 L64 40 Z M58 58 L52 70 L64 60 Z" ${f(c, 0.7)}/><path d="M30 34 L22 26 M30 66 L22 74 M26 50 L16 50" stroke-width="2.6"/>` : ''}
    ${opts.kommando ? `<path d="M55 43 L66 44 L66 47 L55 46 Z" ${f(c, 0.8)}/><path d="M55 44 L49 39 M55 45 L48 43" stroke-width="1.4"/>` : ''}
  </g>`
  const choppa = (big: boolean) => `<line x1="52" y1="${big ? 30 : 32}" x2="${big ? 84 : 76}" y2="${big ? 18 : 24}" stroke-width="2.4"/><path d="M${big ? 78 : 71} ${big ? 12 : 18} L${big ? 90 : 81} ${big ? 10 : 17} L${big ? 92 : 82} ${big ? 24 : 28} L${big ? 82 : 74} ${big ? 24 : 27} Z" ${f(c, 0.35)}/>`
  const slugga = `<rect x="58" y="61" width="15" height="6" rx="1.5" ${f(c, 0.3)}/>`
  const weapon = {
    sluggaChoppa: choppa(false) + slugga,
    bigChoppa: choppa(true) + slugga,
    bigShoota: `<rect x="55" y="55" width="35" height="10" rx="2" ${f(c, 0.3)}/><line x1="80" y1="58" x2="93" y2="58"/><line x1="80" y1="62" x2="93" y2="62"/><circle cx="62" cy="69" r="4.5" ${f(c, 0.35)}/>`,
    rokkit: `<rect x="34" y="59" width="54" height="9" rx="4.5" ${f(c, 0.3)}/><path d="M88 59 L96 63.5 L88 68 Z" ${f(c, 0.6)}/><line x1="44" y1="59" x2="44" y2="68"/>`,
    kustomChoppa: choppa(true) + `<rect x="56" y="58" width="26" height="9" rx="2" ${f(c, 0.3)}/><line x1="76" y1="60.5" x2="88" y2="60.5"/><line x1="76" y1="64.5" x2="88" y2="64.5"/><circle cx="64" cy="70" r="3.5" ${f(c, 0.35)}/>`,
    krumpa: `<path d="M54 26 L74 22 L84 30 L80 40 L66 40 L56 36 Z" ${f(c, 0.45)}/><path d="M74 22 L88 18 M80 30 L92 28 M80 38 L90 40" stroke-width="2.6"/>` + `<rect x="56" y="58" width="24" height="8" rx="2" ${f(c, 0.3)}/><line x1="74" y1="60.5" x2="86" y2="60.5"/>`,
  }[gear]
  return base(c, body + weapon, false)
}

/** Gretchin: a small grot with big ears and a little blasta. */
function gretchin(): string {
  const c = BLUEPRINT_LINE.orks
  return base(c, `
    <ellipse cx="46" cy="50" rx="11" ry="14" ${f(c)}/>
    <circle cx="60" cy="50" r="7" ${f(c, 0.25)}/>
    <path d="M58 43 L52 30 L62 42 Z M58 57 L52 70 L62 58 Z" ${f(c, 0.35)}/>
    <circle cx="63" cy="47.5" r="1" fill="${c}" stroke="none"/><circle cx="63" cy="52.5" r="1" fill="${c}" stroke="none"/>
    <rect x="54" y="58" width="22" height="5" rx="1.5" ${f(c, 0.3)}/><line x1="70" y1="60.5" x2="80" y2="60.5"/>
  `, false)
}

// ---------------------------------------------------------------- Tyranids

/** Hive Tyrant: huge winged monster, crest and horns, bonesword arm, scything talons. */
function hiveTyrant(): string {
  const c = BLUEPRINT_LINE.tyranids
  return base(c, `
    <path d="M34 34 Q8 14 6 44 Q20 38 32 46 Z" ${f(c, 0.12)}/><path d="M34 66 Q8 86 6 56 Q20 62 32 54 Z" ${f(c, 0.12)}/>
    <ellipse cx="42" cy="50" rx="21" ry="25" ${f(c)}/>
    <path d="M26 40 Q42 36 58 40 M24 50 Q42 46 60 50 M26 60 Q42 56 58 60" fill="none" opacity="0.55"/>
    <path d="M56 40 L72 38 L82 50 L72 62 L56 60 Z" ${f(c, 0.3)}/><circle cx="70" cy="45" r="2" fill="${c}" stroke="none"/><circle cx="70" cy="55" r="2" fill="${c}" stroke="none"/>
    <path d="M66 36 L80 22 L74 38 Z M66 64 L80 78 L74 62 Z" ${f(c, 0.5)}/>
    <path d="M48 26 L92 10 L86 20 L56 36 Z" ${f(c, 0.35)}/><path d="M58 24 Q66 16 74 18" fill="none" stroke-dasharray="2 1.5"/>
    <path d="M48 74 L90 86 L82 72 L56 64 Z" ${f(c, 0.35)}/><path d="M62 70 L74 80 M68 68 L80 78" fill="none"/>
  `, false)
}

type TermaGear = 'fleshborer' | 'shard' | 'spike' | 'web'

/** Termagant: small hunched body, clawed forelimbs, a living gun. */
function termagant(gear: TermaGear): string {
  const c = BLUEPRINT_LINE.tyranids
  const gun = {
    fleshborer: `<path d="M54 56 L84 56 L84 62 L54 62 Z" ${f(c, 0.3)}/><circle cx="84" cy="59" r="3" ${f(c, 0.4)}/>`,
    shard: `<path d="M52 54 L80 52 L88 60 L80 68 L52 64 Z" ${f(c, 0.35)}/><line x1="62" y1="54" x2="62" y2="66"/>`,
    spike: `<path d="M52 57 L92 57 L92 61 L52 61 Z" ${f(c, 0.3)}/><line x1="76" y1="52" x2="76" y2="66"/>`,
    web: `<circle cx="70" cy="60" r="9" ${f(c, 0.3)}/><path d="M70 60 L90 48 M70 60 L92 60 M70 60 L90 72" fill="none" stroke-dasharray="2 1.5"/>`,
  }[gear]
  return base(c, `
    <ellipse cx="40" cy="50" rx="16" ry="19" ${f(c)}/><path d="M26 42 Q40 38 54 42 M26 58 Q40 62 54 58" fill="none" opacity="0.5"/>
    <circle cx="58" cy="48" r="8" ${f(c, 0.28)}/><path d="M64 44 L72 40 L68 48 Z" ${f(c, 0.4)}/>
    <path d="M52 38 L68 28 L64 38 Z" ${f(c, 0.3)}/>${gun}
  `, false)
}

/** Hormagaunt: lean sprinter with two huge scything talons. */
function hormagaunt(): string {
  const c = BLUEPRINT_LINE.tyranids
  return base(c, `
    <ellipse cx="38" cy="50" rx="13" ry="16" ${f(c)}/><path d="M28 42 L48 46 M28 58 L48 54" fill="none" opacity="0.5"/>
    <circle cx="54" cy="50" r="7" ${f(c, 0.28)}/>
    <path d="M46 36 Q70 14 92 20 Q76 26 62 42 Z" ${f(c, 0.4)}/><path d="M46 64 Q70 86 92 80 Q76 74 62 58 Z" ${f(c, 0.4)}/>
    <path d="M26 48 Q10 50 6 56" fill="none"/>
  `, false)
}

type WarriorGear = 'devourer' | 'venom' | 'strangler'

/** Tyranid Warrior / Prime: armoured four-armed shooter. */
function warrior(gear: WarriorGear, prime = false): string {
  const c = BLUEPRINT_LINE.tyranids
  const gun = {
    devourer: `<path d="M56 52 L88 52 L88 60 L56 60 Z" ${f(c, 0.3)}/><path d="M88 54 L94 50 M88 58 L94 62" fill="none"/>`,
    venom: `<rect x="54" y="50" width="38" height="11" rx="5" ${f(c, 0.35)}/><circle cx="92" cy="55.5" r="4" ${f(c, 0.5)}/><line x1="66" y1="50" x2="66" y2="61"/>`,
    strangler: `<path d="M54 52 L84 48 L94 56 L84 64 L54 60 Z" ${f(c, 0.35)}/><path d="M60 54 Q74 50 88 56" fill="none"/>`,
  }[gear]
  return base(c, `
    <path d="M30 32 Q14 40 14 50 Q14 60 30 68 Z" ${f(c, 0.12)}/>
    <ellipse cx="42" cy="50" rx="18" ry="22" ${f(c)}/><path d="M28 38 Q42 34 56 38 M26 50 H58 M28 62 Q42 66 56 62" fill="none" opacity="0.55"/>
    <circle cx="44" cy="30" r="9" ${f(c, 0.25)}/><circle cx="44" cy="70" r="9" ${f(c, 0.25)}/>
    <path d="M58 42 L72 40 L78 50 L72 60 L58 58 Z" ${f(c, 0.3)}/><path d="M66 38 L76 28 L72 40 Z M66 62 L76 72 L72 60 Z" ${f(c, 0.5)}/>
    ${prime ? `<path d="M42 50 m-26 0 a26 26 0 1 0 52 0 a26 26 0 1 0 -52 0" fill="none" stroke-dasharray="1.5 3" opacity="0.6"/><path d="M50 22 L56 14 L62 22" fill="none" stroke-width="1.8"/>` : ''}
    ${gun}
    <path d="M52 30 L74 24 L68 30 Z M52 70 L74 76 L68 70 Z" ${f(c, 0.4)}/>
  `, false)
}

// ---------------------------------------------------------------- Necrons

/** Necron Warrior: skeletal metal body, rib lines, gauss flayer. */
/** Winged Tyranid Prime: a warrior body with broad membranous wings and long talons. */
function wingedPrime(): string {
  const c = BLUEPRINT_LINE.tyranids
  return base(c, `
    <path d="M36 34 Q10 8 4 34 Q18 34 30 44 Z" ${f(c, 0.14)}/><path d="M36 66 Q10 92 4 66 Q18 66 30 56 Z" ${f(c, 0.14)}/>
    <path d="M10 20 L26 38 M8 30 L26 42 M10 80 L26 62 M8 70 L26 58" fill="none" opacity="0.6"/>
    <ellipse cx="44" cy="50" rx="16" ry="19" ${f(c)}/>
    <path d="M58 43 L71 41 L77 50 L71 59 L58 57 Z" ${f(c, 0.3)}/><path d="M66 39 L75 29 L71 41 Z M66 61 L75 71 L71 59 Z" ${f(c, 0.5)}/>
    <path d="M52 34 L88 22 L80 32 L58 40 Z M52 66 L88 78 L80 68 L58 60 Z" ${f(c, 0.4)}/>
    <path d="M44 50 m-24 0 a24 24 0 1 0 48 0 a24 24 0 1 0 -48 0" fill="none" stroke-dasharray="1.5 3" opacity="0.6"/>
  `, false)
}

/** Zoanthrope: a huge psychic head over a withered body; the Neurothrope has a crest of synapse nodes. */
function zoanthrope(neuro = false): string {
  const c = BLUEPRINT_LINE.tyranids
  return base(c, `
    <path d="M30 44 Q20 50 30 56 L40 54 L40 46 Z" ${f(c, 0.15)}/>
    <ellipse cx="56" cy="50" rx="22" ry="24" ${f(c, 0.28)}/>
    <path d="M42 38 Q56 30 70 38 M40 50 Q56 44 72 50 M42 62 Q56 70 70 62" fill="none" opacity="0.6"/>
    <circle cx="74" cy="44" r="2" fill="${c}" stroke="none"/><circle cx="74" cy="56" r="2" fill="${c}" stroke="none"/>
    <circle cx="56" cy="50" r="31" fill="none" stroke-dasharray="2 3" opacity="0.5"/>
    ${neuro ? `<circle cx="46" cy="32" r="3" ${f(c, 0.6)}/><circle cx="56" cy="27" r="3" ${f(c, 0.6)}/><circle cx="66" cy="32" r="3" ${f(c, 0.6)}/>` : ''}
  `, false)
}

/** Carnifex: a hulking armoured beast with two pairs of scything talons. */
function carnifex(): string {
  const c = BLUEPRINT_LINE.tyranids
  return base(c, `
    <ellipse cx="42" cy="50" rx="24" ry="27" ${f(c)}/>
    <path d="M24 36 Q42 28 60 36 M22 50 H62 M24 64 Q42 72 60 64" fill="none" opacity="0.55"/>
    <path d="M62 40 L78 38 L86 50 L78 62 L62 60 Z" ${f(c, 0.35)}/><path d="M80 44 L90 40 M80 56 L90 60" stroke-width="2.6"/>
    <path d="M50 26 L84 10 L80 20 L58 32 Z M50 74 L84 90 L80 80 L58 68 Z" ${f(c, 0.4)}/>
    <path d="M56 30 L90 24 L84 32 Z M56 70 L90 76 L84 68 Z" ${f(c, 0.3)}/>
    <path d="M28 30 L22 20 M36 26 L34 16 M28 70 L22 80 M36 74 L34 84" stroke-width="2.4"/>
  `, false)
}

/** Barbgaunt: a squat gaunt carrying a long barblauncher on its back. */
function barbgaunt(): string {
  const c = BLUEPRINT_LINE.tyranids
  return base(c, `
    <ellipse cx="44" cy="50" rx="15" ry="17" ${f(c)}/>
    <circle cx="61" cy="50" r="7.5" ${f(c, 0.25)}/><path d="M66 45 L72 42 M66 55 L72 58" stroke-width="2"/>
    <path d="M30 42 L84 34 L88 40 L32 50 Z" ${f(c, 0.35)}/><circle cx="86" cy="37" r="4" ${f(c, 0.5)}/>
    <path d="M40 36 L36 28 M50 34 L48 26" stroke-width="1.8"/>
  `, false)
}

function necronWarrior(): string {
  const c = BLUEPRINT_LINE.necrons
  return base(c, `
    <ellipse cx="42" cy="50" rx="13" ry="21" ${f(c)}/>
    <path d="M32 38 H52 M32 44 H52 M32 50 H52 M32 56 H52 M32 62 H52" fill="none" opacity="0.5"/><line x1="42" y1="30" x2="42" y2="70" opacity="0.6"/>
    <circle cx="44" cy="30" r="6" ${f(c, 0.28)}/><circle cx="44" cy="70" r="6" ${f(c, 0.28)}/>
    <circle cx="58" cy="50" r="7.5" ${f(c, 0.25)}/><circle cx="61" cy="47.5" r="1.6" fill="${c}" stroke="none"/><circle cx="61" cy="52.5" r="1.6" fill="${c}" stroke="none"/>
    <rect x="52" y="55" width="42" height="6" rx="1.5" ${f(c, 0.3)}/><path d="M78 55 L78 50 L86 50 L86 55" ${f(c, 0.3)}/><circle cx="70" cy="58" r="2.4" fill="${c}" stroke="none"/>
  `, false)
}

/** Immortal: a bulkier warrior with heavier shoulder plates and a gauss blaster; `warden`: a Royal Warden with a cloak and a relic blaster. */
function immortal(warden = false): string {
  const c = BLUEPRINT_LINE.necrons
  return base(c, `
    ${warden ? `<path d="M38 24 Q18 34 16 50 Q18 66 38 76" ${f(c, 0.1)} stroke-dasharray="3 2"/>` : ''}
    <ellipse cx="42" cy="50" rx="15" ry="22" ${f(c)}/>
    <path d="M30 38 H54 M30 46 H54 M30 54 H54 M30 62 H54" fill="none" opacity="0.5"/>
    <rect x="34" y="22" width="18" height="12" rx="3" ${f(c, 0.3)}/><rect x="34" y="66" width="18" height="12" rx="3" ${f(c, 0.3)}/>
    <circle cx="58" cy="50" r="7.5" ${f(c, 0.25)}/><circle cx="61" cy="47.5" r="1.6" fill="${c}" stroke="none"/><circle cx="61" cy="52.5" r="1.6" fill="${c}" stroke="none"/>
    <rect x="52" y="55" width="40" height="9" rx="2" ${f(c, 0.35)}/><line x1="62" y1="59.5" x2="90" y2="59.5" stroke-dasharray="2 2"/>
    ${warden ? `<path d="M50 40 L44 30 L56 36 Z" ${f(c, 0.5)}/><circle cx="92" cy="59.5" r="3" ${f(c, 0.6)}/>` : ''}
  `, false)
}

/** Lychguard: a heavy bodyguard with a long warscythe held across the body. */
function lychguard(): string {
  const c = BLUEPRINT_LINE.necrons
  return base(c, `
    <ellipse cx="42" cy="50" rx="15" ry="22" ${f(c)}/>
    <path d="M30 40 H54 M30 50 H54 M30 60 H54" fill="none" opacity="0.5"/>
    <circle cx="44" cy="29" r="8" ${f(c, 0.3)}/><circle cx="44" cy="71" r="8" ${f(c, 0.3)}/>
    <circle cx="58" cy="50" r="7.5" ${f(c, 0.25)}/><path d="M60 42 L66 36 L64 44 Z" ${f(c, 0.5)}/>
    <line x1="38" y1="80" x2="80" y2="18" stroke-width="2.6"/><path d="M76 14 Q94 14 96 30 Q86 22 72 24 Z" ${f(c, 0.5)}/>
  `, false)
}

/** Canoptek Wraith: a phasing serpentine construct with a long spine and grasping claws. */
function canoptekWraith(): string {
  const c = BLUEPRINT_LINE.necrons
  return base(c, `
    <path d="M14 50 Q24 38 34 50 Q44 62 54 50" fill="none" stroke-width="3"/>
    <path d="M18 46 L20 40 M26 44 L28 38 M34 52 L36 58 M42 56 L44 62" opacity="0.6"/>
    <ellipse cx="60" cy="50" rx="11" ry="13" ${f(c)}/>
    <circle cx="70" cy="50" r="7" ${f(c, 0.3)}/><circle cx="73" cy="47" r="1.6" fill="${c}" stroke="none"/><circle cx="73" cy="53" r="1.6" fill="${c}" stroke="none"/>
    <path d="M62 38 L80 22 L88 26 M80 22 L84 16 M62 62 L80 78 L88 74 M80 78 L84 84" fill="none" stroke-width="2.2"/>
    <circle cx="50" cy="50" r="34" fill="none" stroke-dasharray="1 4" opacity="0.5"/>
  `, false)
}

/** Overlord: crested noble with blade and tachyon-arrow staff. */
function overlord(): string {
  const c = BLUEPRINT_LINE.necrons
  return base(c, `
    <path d="M38 22 Q14 32 12 50 Q14 68 38 78" ${f(c, 0.1)} stroke-dasharray="3 2"/>
    <ellipse cx="42" cy="50" rx="15" ry="22" ${f(c)}/><path d="M30 40 H54 M30 50 H54 M30 60 H54" fill="none" opacity="0.5"/>
    <circle cx="44" cy="29" r="8" ${f(c, 0.3)}/><circle cx="44" cy="71" r="8" ${f(c, 0.3)}/>
    <circle cx="58" cy="50" r="8" ${f(c, 0.28)}/><path d="M54 42 L46 30 L60 38 Z M54 58 L46 70 L60 62 Z M62 44 L72 50 L62 56 Z" ${f(c, 0.45)}/>
    <path d="M52 30 L90 12 L88 20 L58 38 Z" ${f(c, 0.4)}/><line x1="58" y1="34" x2="82" y2="22" opacity="0.7"/>
    <line x1="50" y1="70" x2="94" y2="82" stroke-width="2.4"/><path d="M88 76 L97 82 L88 88 Z" ${f(c, 0.5)}/><circle cx="62" cy="73" r="3" ${f(c, 0.4)}/>
  `, false)
}

/** Skorpekh Destroyer: hunched cult killer with two giant hyperphase blades. */
function skorpekh(): string {
  const c = BLUEPRINT_LINE.necrons
  return base(c, `
    <ellipse cx="38" cy="50" rx="15" ry="22" ${f(c)}/><path d="M26 40 H50 M26 50 H50 M26 60 H50" fill="none" opacity="0.5"/>
    <path d="M52 44 L58 40 L64 50 L58 60 L52 56 Z" ${f(c, 0.3)}/><circle cx="60" cy="47" r="1.4" fill="${c}" stroke="none"/><circle cx="60" cy="53" r="1.4" fill="${c}" stroke="none"/>
    <path d="M46 34 Q66 10 94 18 Q76 24 60 42 Z" ${f(c, 0.4)}/><path d="M52 32 Q70 18 88 20" fill="none" stroke-dasharray="2 1.5"/>
    <path d="M46 66 Q66 90 94 82 Q76 76 60 58 Z" ${f(c, 0.4)}/>
    <circle cx="30" cy="34" r="4" ${f(c, 0.3)}/><circle cx="30" cy="66" r="4" ${f(c, 0.3)}/>
  `, false)
}

/** Canoptek Scarab Swarm: a cluster of small scarabs. */
function scarabs(): string {
  const c = BLUEPRINT_LINE.necrons
  const bug = (x: number, y: number, a: number, s: number) =>
    `<g transform="translate(${x} ${y}) rotate(${a}) scale(${s})"><ellipse cx="0" cy="0" rx="7" ry="4.5" ${f(c, 0.3)}/><path d="M-5 0 H5 M0 -4.5 V4.5" fill="none" opacity="0.6"/><circle cx="8" cy="0" r="2.4" ${f(c, 0.4)}/><path d="M6 -3 L12 -6 M6 3 L12 6 M-2 -4 L-6 -9 M-2 4 L-6 9" fill="none"/></g>`
  return base(c, bug(42, 40, -20, 1.1) + bug(58, 56, 25, 1) + bug(34, 62, 10, 1.15) + bug(66, 36, -40, 0.85) + bug(48, 50, 0, 0.8) + bug(74, 62, 35, 0.8) + bug(26, 46, -10, 0.8), false)
}

// ---------------------------------------------------------------- Aeldari

type AeldariGear = 'catapult' | 'laser' | 'cannon'

/** Guardian Defender: slim Eldar in a plumed helm with a shuriken catapult. */
function guardian(): string {
  const c = BLUEPRINT_LINE.aeldari
  return base(c, `
    <ellipse cx="42" cy="50" rx="11" ry="19" ${f(c)}/><path d="M34 42 Q42 38 50 42" fill="none" opacity="0.5"/>
    <circle cx="42" cy="32" r="6" ${f(c, 0.28)}/><circle cx="42" cy="68" r="6" ${f(c, 0.28)}/>
    <circle cx="55" cy="50" r="7" ${f(c, 0.28)}/><path d="M50 48 Q36 40 22 50 Q36 60 50 52" ${f(c, 0.3)}/><line x1="61" y1="46" x2="61" y2="54" stroke-width="2.2"/>
    <rect x="54" y="56" width="32" height="5" rx="2" ${f(c, 0.3)}/><path d="M86 54 L94 58.5 L86 63 Z" ${f(c, 0.45)}/><rect x="64" y="52" width="9" height="4" ${f(c, 0.3)}/>
  `, false)
}

/** Heavy Weapon Platform: hovering disc with a pintle gun. */
function heavyPlatform(): string {
  const c = BLUEPRINT_LINE.aeldari
  return base(c, `
    <ellipse cx="46" cy="50" rx="26" ry="22" ${f(c, 0.18)}/><ellipse cx="46" cy="50" rx="18" ry="15" ${f(c, 0.3)}/>
    <path d="M24 38 L14 30 M24 62 L14 70" fill="none" stroke-width="2.4"/>
    <rect x="46" y="44" width="46" height="12" rx="4" ${f(c, 0.35)}/><path d="M78 44 L78 38 L90 38 L90 44" ${f(c, 0.3)}/><circle cx="52" cy="50" r="5" ${f(c, 0.5)}/>
    <circle cx="36" cy="50" r="4" fill="${c}" stroke="none"/>
  `, false)
}

/** Dire Avenger / Exarch: helmed aspect warrior; the Exarch carries a diresword and a crest. */
function direAvenger(exarch = false): string {
  const c = BLUEPRINT_LINE.aeldari
  return base(c, `
    ${exarch ? `<path d="M36 22 Q14 32 12 50 Q14 68 36 78" ${f(c, 0.1)} stroke-dasharray="3 2"/>` : ''}
    <ellipse cx="42" cy="50" rx="13" ry="20" ${f(c)}/><path d="M32 42 Q42 36 52 42 M32 58 Q42 64 52 58" fill="none" opacity="0.55"/>
    <circle cx="42" cy="31" r="7" ${f(c, 0.3)}/><circle cx="42" cy="69" r="7" ${f(c, 0.3)}/>
    <circle cx="57" cy="50" r="7.5" ${f(c, 0.28)}/><path d="M54 43 Q42 36 28 50 Q42 64 54 57" ${f(c, exarch ? 0.4 : 0.28)}/>
    ${exarch
      ? `<line x1="54" y1="32" x2="92" y2="20" stroke-width="2.8"/><line x1="58" y1="28" x2="62" y2="38" stroke-width="2"/><rect x="58" y="60" width="16" height="5" rx="2" ${f(c, 0.3)}/>`
      : `<rect x="52" y="55" width="34" height="7" rx="2.5" ${f(c, 0.3)}/><rect x="52" y="63" width="34" height="5" rx="2" ${f(c, 0.25)}/><path d="M86 55 L94 58.5 L86 62 Z" ${f(c, 0.45)}/>`}
  `, false)
}

/** Autarch: a crested commander with a long star glaive and a pistol. */
function autarch(): string {
  const c = BLUEPRINT_LINE.aeldari
  return base(c, `
    <path d="M36 22 Q12 32 10 50 Q12 68 36 78" ${f(c, 0.1)} stroke-dasharray="3 2"/>
    <ellipse cx="42" cy="50" rx="13" ry="20" ${f(c)}/><path d="M32 42 Q42 36 52 42 M32 58 Q42 64 52 58" fill="none" opacity="0.55"/>
    <circle cx="42" cy="31" r="7" ${f(c, 0.3)}/><circle cx="42" cy="69" r="7" ${f(c, 0.3)}/>
    <circle cx="57" cy="50" r="7.5" ${f(c, 0.3)}/><path d="M50 50 L36 44 L36 56 Z" ${f(c, 0.5)}/>
    <line x1="44" y1="78" x2="88" y2="16" stroke-width="2.6"/><path d="M84 12 L96 8 L90 22 Z" ${f(c, 0.55)}/>
    <rect x="58" y="60" width="15" height="5" rx="2" ${f(c, 0.3)}/>
  `, false)
}

/** Ranger: a hooded scout in a cameleoline cloak with a very long rifle. */
function aeldariRanger(): string {
  const c = BLUEPRINT_LINE.aeldari
  return base(c, `
    <path d="M30 30 Q16 50 30 70 L52 64 L52 36 Z" ${f(c, 0.15)} stroke-dasharray="2 2"/>
    <ellipse cx="44" cy="50" rx="11" ry="16" ${f(c)}/>
    <path d="M50 42 Q62 50 50 58 Q46 50 50 42 Z" ${f(c, 0.35)}/>
    <rect x="50" y="53" width="46" height="4" rx="1.5" ${f(c, 0.35)}/><rect x="62" y="49" width="8" height="4" ${f(c, 0.3)}/>
  `, false)
}

/** Wraithguard: a tall wraithbone construct with a heavy wraithcannon. */
function wraithguard(): string {
  const c = BLUEPRINT_LINE.aeldari
  return base(c, `
    <ellipse cx="42" cy="50" rx="16" ry="22" ${f(c)}/>
    <path d="M30 36 Q42 30 54 36 M28 50 H56 M30 64 Q42 70 54 64" fill="none" opacity="0.55"/>
    <path d="M56 42 L68 46 L68 54 L56 58 Z" ${f(c, 0.35)}/><line x1="64" y1="44" x2="64" y2="56" stroke-width="2.4"/>
    <rect x="50" y="62" width="36" height="12" rx="4" ${f(c, 0.35)}/><circle cx="88" cy="68" r="5" ${f(c, 0.55)}/>
    <circle cx="38" cy="50" r="4" ${f(c, 0.5)}/>
  `, false)
}

/** Swooping Hawk: an Aspect Warrior with spread feathered wings; the Exarch has a crest. */
function swoopingHawk(exarch = false): string {
  const c = BLUEPRINT_LINE.aeldari
  return base(c, `
    <path d="M40 38 Q20 12 8 18 Q22 30 30 44 Z" ${f(c, 0.18)}/><path d="M40 62 Q20 88 8 82 Q22 70 30 56 Z" ${f(c, 0.18)}/>
    <path d="M14 20 L28 38 M10 28 L26 42 M14 80 L28 62 M10 72 L26 58" fill="none" opacity="0.55"/>
    <ellipse cx="44" cy="50" rx="11" ry="15" ${f(c)}/>
    <circle cx="57" cy="50" r="6.5" ${f(c, 0.3)}/>
    ${exarch ? `<path d="M52 44 L44 34 L58 42 Z" ${f(c, 0.55)}/>` : ''}
    <rect x="52" y="56" width="${exarch ? 38 : 32}" height="6" rx="2" ${f(c, 0.35)}/>
  `, false)
}

/** Windrider: rider on a jetbike, a pair of fins and a bow gun. */
function windrider(gear: AeldariGear): string {
  const c = BLUEPRINT_LINE.aeldari
  const gun = {
    catapult: `<rect x="66" y="42" width="26" height="5" rx="2" ${f(c, 0.35)}/><rect x="66" y="53" width="26" height="5" rx="2" ${f(c, 0.35)}/>`,
    laser: `<rect x="58" y="43" width="34" height="14" rx="5" ${f(c, 0.35)}/><line x1="76" y1="43" x2="76" y2="57"/><line x1="84" y1="43" x2="84" y2="57"/>`,
    cannon: `<path d="M60 44 L92 44 L92 56 L60 56 Z" ${f(c, 0.35)}/><circle cx="92" cy="50" r="4" ${f(c, 0.5)}/>`,
  }[gear]
  return base(c, `
    <path d="M22 28 L50 44 L50 56 L22 72 L14 50 Z" ${f(c, 0.18)}/><path d="M30 34 L10 22 M30 66 L10 78" fill="none" stroke-width="2.4"/>
    <path d="M30 38 Q62 32 76 50 Q62 68 30 62 Z" ${f(c)}/><path d="M40 44 H66 M40 56 H66" fill="none" opacity="0.5"/>
    <circle cx="50" cy="50" r="7" ${f(c, 0.3)}/><path d="M46 44 Q38 42 32 50 Q38 58 46 56" ${f(c, 0.4)}/>${gun}
  `, false)
}

/** Farseer: tall-crested robed seer with a staff and runic arcs. */
function farseer(): string {
  const c = BLUEPRINT_LINE.aeldari
  return base(c, `
    <path d="M42 50 m-30 0 a30 30 0 1 0 60 0 a30 30 0 1 0 -60 0" fill="none" stroke-dasharray="2 3" opacity="0.5"/>
    <path d="M36 24 Q12 34 12 50 Q12 66 36 76" ${f(c, 0.12)}/>
    <ellipse cx="42" cy="50" rx="14" ry="21" ${f(c)}/><path d="M32 40 L52 60 M52 40 L32 60" fill="none" opacity="0.4"/>
    <circle cx="44" cy="30" r="6" ${f(c, 0.28)}/><circle cx="44" cy="70" r="6" ${f(c, 0.28)}/>
    <circle cx="57" cy="50" r="7.5" ${f(c, 0.28)}/><path d="M56 42 Q44 28 28 36 Q40 44 54 48 Z M56 58 Q44 72 28 64 Q40 56 54 52 Z" ${f(c, 0.35)}/>
    <line x1="50" y1="68" x2="92" y2="84" stroke-width="2.4"/><circle cx="92" cy="84" r="4" ${f(c, 0.5)}/>
    <rect x="58" y="58" width="14" height="4" rx="2" ${f(c, 0.3)}/>
  `, false)
}


// ---------------------------------------------------------------- Adeptus Mechanicus
// Brass line work with deep-red robes: hoods, cog halos, mechanical skulls and servo-arms.

const BRASS = BLUEPRINT_LINE.adeptus_mechanicus
const RED = '#c0392b'
const rd = (o = 0.4) => `fill="${RED}" fill-opacity="${o}"`

/** Toothed cog outline centred on (cx, cy). */
function cog(cx: number, cy: number, r: number, teeth = 10): string {
  const pts = Array.from({ length: teeth * 2 }, (_, i) => {
    const a = (i / (teeth * 2)) * Math.PI * 2
    const rr = i % 2 === 0 ? r : r * 0.8
    return `${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`
  })
  return `<path d="M${pts.join(' L')} Z" ${f(BRASS, 0.18)}/>`
}

/** Mechanical skull face: brow, two eye lenses and a grille, seen from above-front. */
const skull = (x: number, y: number, s = 1) =>
  `<g transform="translate(${x} ${y}) scale(${s})"><circle r="6.5" ${f(BRASS, 0.3)}/><circle cx="2.4" cy="-2.2" r="1.5" fill="${RED}" stroke="none"/><circle cx="2.4" cy="2.2" r="1.5" fill="${RED}" stroke="none"/><path d="M5 -2 V2" stroke-width="1"/></g>`

type TechKind = 'dominus' | 'manipulus'

/** Tech-Priest: robed adept under a cog halo, servo-arms behind, axe (Dominus) or magnarail lance (Manipulus). */
function techPriest(kind: TechKind): string {
  const arms = `<path d="M34 40 Q16 30 10 18 M34 60 Q16 70 10 82 M34 50 Q14 50 8 50" fill="none" stroke-width="1.8"/><circle cx="10" cy="18" r="2.4" ${f(BRASS, 0.5)}/><circle cx="10" cy="82" r="2.4" ${f(BRASS, 0.5)}/>`
  const gear = kind === 'dominus'
    ? `<line x1="52" y1="62" x2="88" y2="40" stroke-width="2.6"/><path d="M82 30 L94 38 L86 48 L80 40 Z" ${f(BRASS, 0.5)}/><rect x="56" y="64" width="16" height="4.5" rx="2" ${f(BRASS, 0.3)}/>`
    : `<rect x="50" y="44" width="46" height="6" rx="2" ${f(BRASS, 0.3)}/><rect x="62" y="40" width="22" height="3" ${f(BRASS, 0.4)}/><line x1="50" y1="64" x2="74" y2="64" stroke-width="2.4"/><circle cx="76" cy="64" r="3.2" ${f(BRASS, 0.5)}/>`
  return base(BRASS, `${cog(44, 50, 30, 12)}${arms}
    <path d="M28 24 Q10 40 12 50 Q10 60 28 76 Q54 70 58 50 Q54 30 28 24 Z" ${rd(0.42)}/><path d="M30 40 L52 60 M52 40 L30 60" fill="none" opacity="0.4"/>
    <circle cx="48" cy="50" r="9.5" ${rd(0.55)}/>${skull(51, 50, 0.9)}${gear}`, false)
}

type SkitGear = 'rifle' | 'longRifle' | 'carbine' | 'arc' | 'caliver' | 'pistol'

/** Skitarii: slim hooded trooper with a mechanical skull; rifle length shows the role (Rangers long, Vanguard short). */
function skitarii(gear: SkitGear, opts: { alpha?: boolean; omnispex?: boolean; vanguard?: boolean } = {}): string {
  const weapon = {
    rifle: `<rect x="52" y="56" width="38" height="4.5" rx="2" ${f(BRASS, 0.3)}/><rect x="70" y="52.5" width="9" height="3.5" ${f(BRASS, 0.4)}/>`,
    longRifle: `<rect x="50" y="56" width="44" height="4" rx="2" ${f(BRASS, 0.3)}/><rect x="64" y="52" width="14" height="3" ${f(BRASS, 0.4)}/>`,
    carbine: `<rect x="52" y="55" width="28" height="7" rx="3" ${f(BRASS, 0.35)}/><path d="M80 55 L90 58.5 L80 62 Z" ${f(BRASS, 0.5)}/>`,
    arc: `<rect x="52" y="55" width="34" height="6" rx="2" ${f(BRASS, 0.3)}/><path d="M86 52 L92 58 L86 64 M90 50 L96 58 L90 66" fill="none" stroke-width="1.6"/>`,
    caliver: `<rect x="52" y="55" width="30" height="7" rx="2.5" ${f(BRASS, 0.3)}/><circle cx="84" cy="58.5" r="4.4" ${f(RED, 0.5)}/>`,
    pistol: `<rect x="56" y="61" width="15" height="5" rx="1.5" ${f(BRASS, 0.3)}/>`,
  }[gear]
  const alpha = opts.alpha ? `<line x1="54" y1="32" x2="84" y2="24" stroke-width="2.4"/><path d="M34 26 H52" stroke-width="2.2"/>` : ''
  const omni = opts.omnispex ? `<circle cx="64" cy="46" r="3.6" ${f(RED, 0.5)}/><line x1="60" y1="46" x2="52" y2="48"/>` : ''
  const rad = opts.vanguard ? `<circle cx="50" cy="50" r="23" fill="none" stroke-dasharray="1.5 3.5" opacity="0.6"/>` : ''
  return base(BRASS, `${rad}
    <path d="M22 36 Q10 50 22 64 L38 60 L38 40 Z" ${rd(0.3)}/>
    <ellipse cx="42" cy="50" rx="12" ry="18" ${rd(0.45)}/><path d="M34 42 L50 58" fill="none" opacity="0.4"/>
    <circle cx="44" cy="33" r="6" ${f(BRASS, 0.25)}/><circle cx="44" cy="67" r="6" ${f(BRASS, 0.25)}/>
    <circle cx="54" cy="50" r="7.5" ${rd(0.55)}/>${skull(57, 50, 0.7)}${alpha}${omni}${weapon}`, false)
}

type KataKind = 'breacher' | 'breacherTorsion' | 'breacherHydraulic' | 'destroyer' | 'destroyerCulverin'

/** Kataphron: hulking cyborg on tracks, armoured dome head, heavy gun on the right and a claw or flamer on the left. */
function kataphron(kind: KataKind): string {
  const breacher = kind.startsWith('breacher')
  const gun = kind === 'breacherTorsion'
    ? `<path d="M56 40 H92 V52 H56 Z" ${f(BRASS, 0.35)}/><circle cx="92" cy="46" r="5" ${f(RED, 0.5)}/>`
    : kind === 'destroyerCulverin'
      ? `<rect x="54" y="38" width="38" height="12" rx="5" ${f(BRASS, 0.35)}/><circle cx="92" cy="44" r="4.5" ${f(RED, 0.55)}/><rect x="60" y="34" width="20" height="4" ${f(BRASS, 0.4)}/>`
      : breacher
        ? `<rect x="54" y="40" width="36" height="9" rx="2" ${f(BRASS, 0.3)}/><path d="M90 38 L96 44.5 L90 51" fill="none" stroke-width="1.8"/>`
        : `<rect x="54" y="38" width="30" height="5" rx="2" ${f(BRASS, 0.35)}/><rect x="54" y="45" width="30" height="5" rx="2" ${f(BRASS, 0.35)}/><rect x="54" y="52" width="30" height="5" rx="2" ${f(BRASS, 0.35)}/>`
  const left = kind === 'breacherHydraulic'
    ? `<path d="M52 60 L78 66 L86 58 M78 66 L88 72" fill="none" stroke-width="3.4"/>`
    : breacher
      ? `<path d="M52 62 L72 68 M72 68 L82 62 M72 68 L84 70 M72 68 L80 76" fill="none" stroke-width="2.4"/>`
      : `<rect x="52" y="62" width="22" height="6" rx="3" ${f(BRASS, 0.3)}/><circle cx="78" cy="65" r="3.4" ${f(RED, 0.5)}/>`
  return base(BRASS, `
    <rect x="12" y="22" width="52" height="12" rx="4" ${f(BRASS, 0.18)}/><rect x="12" y="66" width="52" height="12" rx="4" ${f(BRASS, 0.18)}/>
    <path d="M16 26 H60 M16 74 H60" fill="none" stroke-dasharray="3 2" opacity="0.6"/>
    <rect x="20" y="30" width="40" height="40" rx="8" ${rd(0.42)}/><path d="M26 38 H54 M26 62 H54" fill="none" opacity="0.4"/>
    <circle cx="46" cy="50" r="12" ${f(BRASS, 0.3)}/><circle cx="46" cy="50" r="6" ${rd(0.6)}/>${skull(49, 50, 0.55)}${gun}${left}`, false)
}

type SicGear = 'carbine' | 'taser'

/** Sicarian Infiltrator: lean, forward-leaning stalker with a domed head, cloak tatters and a blade or taser goad. */
function sicarian(gear: SicGear, princeps = false): string {
  const arms = gear === 'carbine'
    ? `<line x1="52" y1="34" x2="92" y2="22" stroke-width="2.6"/><line x1="56" y1="30" x2="60" y2="40" stroke-width="2"/><rect x="58" y="60" width="18" height="6" rx="2" ${f(BRASS, 0.35)}/>`
    : `<path d="M52 34 L90 26 M52 34 L92 32 M52 34 L88 38" fill="none" stroke-width="1.8"/><path d="M90 24 L96 30 L90 40" fill="none" stroke-width="1.6"/><rect x="56" y="60" width="26" height="8" rx="3" ${f(BRASS, 0.35)}/>`
  return base(BRASS, `
    <path d="M30 30 L8 40 L18 46 L6 52 L18 56 L8 62 L30 72 Z" ${rd(0.22)} stroke-dasharray="2 2"/>
    <path d="M26 36 Q44 28 58 50 Q44 72 26 64 Z" ${rd(0.45)}/><path d="M34 46 H52 M34 54 H52" fill="none" opacity="0.4"/>
    <circle cx="56" cy="50" r="7.5" ${f(BRASS, 0.3)}/><path d="M52 44 Q64 50 52 56" fill="none"/><circle cx="60" cy="47" r="1.8" fill="${RED}" stroke="none"/><circle cx="60" cy="53" r="1.8" fill="${RED}" stroke="none"/>
    ${princeps ? `<path d="M40 24 L50 30 L40 36 M40 64 L50 70 L40 76" fill="none" stroke-width="1.8"/>` : ''}${arms}`, false)
}

type KastGear = 'combustor' | 'guns'

/** Kastelan Robot: boxy war-automaton with a cog chest plate, a massive fist and a shoulder weapon. */
function kastelan(gear: KastGear): string {
  const shoulder = gear === 'combustor'
    ? `<path d="M56 30 H76 L92 36 V44 L76 48 H56 Z" ${f(BRASS, 0.35)}/><circle cx="92" cy="40" r="4" ${f(RED, 0.6)}/>`
    : `<rect x="54" y="28" width="40" height="8" rx="2" ${f(BRASS, 0.35)}/><rect x="54" y="38" width="32" height="7" rx="2" ${f(BRASS, 0.35)}/>`
  return base(BRASS, `
    <rect x="14" y="16" width="14" height="20" rx="3" ${f(BRASS, 0.2)}/><rect x="14" y="64" width="14" height="20" rx="3" ${f(BRASS, 0.2)}/>
    <rect x="22" y="24" width="38" height="52" rx="6" ${rd(0.42)}/>${cog(41, 50, 13, 8)}<circle cx="41" cy="50" r="4" ${rd(0.7)}/>
    <rect x="52" y="42" width="14" height="16" rx="3" ${f(BRASS, 0.3)}/>${skull(60, 50, 0.7)}
    <circle cx="76" cy="66" r="11" ${f(BRASS, 0.3)}/><circle cx="76" cy="66" r="6" ${rd(0.55)}/><path d="M60 62 L68 64" stroke-width="3.4"/>${shoulder}`, false)
}

/** Faction emblem (shown on the army selection card): a toothed cog around a mechanical skull. */
export const mechanicusEmblem = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="49" fill="#2a0c0c"/>
  <g stroke="${BRASS}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
    ${cog(50, 50, 40, 16)}<circle cx="50" cy="50" r="27" fill="#8a1f1f" fill-opacity="0.8"/>
    <path d="M32 46 Q32 28 50 28 Q68 28 68 46 Q68 54 62 58 V66 H38 V58 Q32 54 32 46 Z" fill="${BRASS}" fill-opacity="0.85" stroke="#2a0c0c"/>
    <circle cx="42" cy="46" r="5" fill="#2a0c0c"/><circle cx="58" cy="46" r="5" fill="#8a1f1f" stroke="#2a0c0c"/>
    <path d="M50 52 L47 60 H53 Z" fill="#2a0c0c" stroke="none"/><path d="M42 66 V60 M46 66 V61 M50 66 V61 M54 66 V61 M58 66 V60" stroke="#2a0c0c" stroke-width="1.6"/>
    <path d="M20 20 L34 34 M80 20 L66 34" fill="none" opacity="0.5"/>
  </g></svg>`

type HoundGear = 'pistols' | 'carbine'

/** Serberys Sulphurhound: a mechanical hound seen from above, a Skitarius rider on its back, sulphur cone ahead. */
function sulphurhound(gear: HoundGear, alpha = false): string {
  const weapon = gear === 'carbine'
    ? `<rect x="46" y="30" width="26" height="6" rx="2.5" ${f(BRASS, 0.35)}/><circle cx="73" cy="33" r="3.4" ${f(RED, 0.5)}/>`
    : `<rect x="48" y="30" width="14" height="4" rx="1.5" ${f(BRASS, 0.35)}/><rect x="48" y="66" width="14" height="4" rx="1.5" ${f(BRASS, 0.35)}/>`
  const maul = alpha ? `<line x1="40" y1="68" x2="62" y2="80" stroke-width="2.4"/><circle cx="64" cy="81" r="3.6" ${f(RED, 0.55)}/>` : ''
  return base(BRASS, `
    <path d="M84 50 L96 42 M84 50 L96 50 M84 50 L96 58" fill="none" stroke-dasharray="2 2" opacity="0.7"/>
    <path d="M22 36 L12 26 M22 64 L12 74 M56 36 L64 24 M56 64 L64 76" fill="none" stroke-width="3"/>
    <ellipse cx="44" cy="50" rx="30" ry="14" ${rd(0.38)}/><path d="M20 50 H66" fill="none" opacity="0.4" stroke-dasharray="3 2"/>
    <path d="M70 42 L86 46 L86 54 L70 58 Z" ${f(BRASS, 0.35)}/><circle cx="82" cy="47" r="1.6" fill="${RED}" stroke="none"/><circle cx="82" cy="53" r="1.6" fill="${RED}" stroke="none"/>
    <path d="M14 50 L6 50" stroke-width="2"/>
    <circle cx="40" cy="50" r="8" ${rd(0.55)}/>${skull(42, 50, 0.6)}${weapon}${maul}`, false)
}

type StriderGear = 'autocannon' | 'lascannon'

/** Ironstrider Ballistarius: a tall two-legged walker; the cockpit pod with the pilot and twin long barrels forward. */
function ironstrider(gear: StriderGear): string {
  const guns = gear === 'lascannon'
    ? `<rect x="58" y="38" width="38" height="5" rx="2" ${f(BRASS, 0.35)}/><rect x="58" y="57" width="38" height="5" rx="2" ${f(BRASS, 0.35)}/><circle cx="94" cy="40.5" r="2.8" ${f(RED, 0.6)}/><circle cx="94" cy="59.5" r="2.8" ${f(RED, 0.6)}/>`
    : `<rect x="58" y="37" width="32" height="7" rx="2" ${f(BRASS, 0.35)}/><rect x="58" y="56" width="32" height="7" rx="2" ${f(BRASS, 0.35)}/><rect x="88" y="38.5" width="6" height="4" ${f(BRASS, 0.5)}/><rect x="88" y="57.5" width="6" height="4" ${f(BRASS, 0.5)}/>`
  return base(BRASS, `
    <path d="M30 34 L16 16 L24 12 M30 66 L16 84 L24 88" fill="none" stroke-width="3"/><circle cx="16" cy="16" r="3" ${f(BRASS, 0.4)}/><circle cx="16" cy="84" r="3" ${f(BRASS, 0.4)}/>
    <rect x="26" y="30" width="34" height="40" rx="12" ${rd(0.4)}/>${cog(43, 50, 12, 8)}
    <circle cx="50" cy="50" r="7" ${f(BRASS, 0.3)}/>${skull(52, 50, 0.55)}${guns}`, false)
}

type OnagerGear = 'beamer' | 'missiles' | 'neutron' | 'phosphor'

/** Onager Dunecrawler: a wide four-legged hull with a turret; the turret weapon shows the loadout. */
function onager(gear: OnagerGear): string {
  const turret = {
    beamer: `<rect x="56" y="44" width="30" height="12" rx="4" ${f(BRASS, 0.35)}/><path d="M86 42 L96 50 L86 58" fill="none" stroke-width="1.8"/><circle cx="72" cy="50" r="3" ${f(RED, 0.6)}/>`,
    missiles: `<rect x="56" y="36" width="20" height="12" rx="2" ${f(BRASS, 0.35)}/><path d="M60 39 H72 M60 42 H72 M60 45 H72" fill="none" stroke-width="1"/><rect x="56" y="54" width="34" height="5" rx="2" ${f(BRASS, 0.35)}/><rect x="56" y="60" width="34" height="5" rx="2" ${f(BRASS, 0.35)}/>`,
    neutron: `<rect x="56" y="46" width="40" height="8" rx="3" ${f(BRASS, 0.35)}/><circle cx="62" cy="50" r="5" ${f(RED, 0.5)}/><path d="M70 46 V54 M78 46 V54 M86 46 V54" fill="none" stroke-width="1"/>`,
    phosphor: `<rect x="56" y="40" width="32" height="7" rx="3" ${f(BRASS, 0.35)}/><rect x="56" y="53" width="32" height="7" rx="3" ${f(BRASS, 0.35)}/><circle cx="90" cy="43.5" r="3" ${f(RED, 0.55)}/><circle cx="90" cy="56.5" r="3" ${f(RED, 0.55)}/>`,
  }[gear]
  return base(BRASS, `
    <path d="M24 28 L10 14 M24 72 L10 86 M60 28 L72 12 M60 72 L72 88" fill="none" stroke-width="3.4"/>
    <circle cx="10" cy="14" r="3" ${f(BRASS, 0.4)}/><circle cx="10" cy="86" r="3" ${f(BRASS, 0.4)}/><circle cx="72" cy="12" r="3" ${f(BRASS, 0.4)}/><circle cx="72" cy="88" r="3" ${f(BRASS, 0.4)}/>
    <path d="M16 36 L28 24 H58 L68 36 V64 L58 76 H28 L16 64 Z" ${rd(0.38)}/><path d="M22 40 H62 M22 60 H62" fill="none" opacity="0.4"/>
    <circle cx="44" cy="50" r="13" ${f(BRASS, 0.25)}/>${cog(44, 50, 9, 8)}${skull(30, 50, 0.6)}${turret}`, false)
}

/** Corpuscarii Electro-Priest: a robed zealot, arms spread, lightning arcing from the gauntlets. */
function electroPriest(): string {
  return base(BRASS, `
    <path d="M60 24 L72 18 L68 26 L80 22 M60 76 L72 82 L68 74 L80 78" fill="none" stroke-width="1.8" stroke="${RED}"/>
    <path d="M44 30 L60 24 M44 70 L60 76" fill="none" stroke-width="3"/><circle cx="60" cy="24" r="4" ${f(RED, 0.5)}/><circle cx="60" cy="76" r="4" ${f(RED, 0.5)}/>
    <path d="M22 34 Q12 50 22 66 L46 62 L46 38 Z" ${rd(0.4)}/><path d="M28 42 L40 58 M40 42 L28 58" fill="none" opacity="0.4"/>
    <circle cx="50" cy="50" r="9" ${rd(0.55)}/><path d="M46 44 L54 50 L46 56" fill="none" stroke-width="1.4"/>
    <path d="M58 50 L66 46 L64 52 L72 48" fill="none" stroke="${RED}" stroke-width="1.6"/>`, false)
}

const SVGS: Record<string, string> = {
  hiveTyrant: hiveTyrant(),
  termagant: termagant('fleshborer'),
  termagantShard: termagant('shard'),
  termagantSpike: termagant('spike'),
  termagantWeb: termagant('web'),
  hormagaunt: hormagaunt(),
  tyranidPrime: warrior('devourer', true),
  wingedPrime: wingedPrime(),
  neurothrope: zoanthrope(true),
  zoanthrope: zoanthrope(),
  carnifex: carnifex(),
  barbgaunt: barbgaunt(),
  tyranidWarrior: warrior('devourer'),
  tyranidWarriorVenom: warrior('venom'),
  tyranidWarriorStrangler: warrior('strangler'),
  overlord: overlord(),
  necronWarrior: necronWarrior(),
  royalWarden: immortal(true),
  immortal: immortal(),
  lychguard: lychguard(),
  canoptekWraith: canoptekWraith(),
  skorpekh: skorpekh(),
  scarab: scarabs(),
  farseer: farseer(),
  guardian: guardian(),
  heavyPlatform: heavyPlatform(),
  direAvenger: direAvenger(),
  autarch: autarch(),
  aeldariRanger: aeldariRanger(),
  wraithguard: wraithguard(),
  hawkExarch: swoopingHawk(true),
  swoopingHawk: swoopingHawk(),
  exarch: direAvenger(true),
  windrider: windrider('catapult'),
  windriderLaser: windrider('laser'),
  windriderCannon: windrider('cannon'),
  techDominus: techPriest('dominus'),
  techManipulus: techPriest('manipulus'),
  rangerAlpha: skitarii('longRifle', { alpha: true }),
  ranger: skitarii('longRifle'),
  rangerOmnispex: skitarii('longRifle', { omnispex: true }),
  rangerArc: skitarii('arc'),
  rangerCaliver: skitarii('caliver'),
  vanguardAlpha: skitarii('pistol', { alpha: true, vanguard: true }),
  vanguard: skitarii('carbine', { vanguard: true }),
  vanguardArc: skitarii('arc', { vanguard: true }),
  vanguardCaliver: skitarii('caliver', { vanguard: true }),
  breacher: kataphron('breacher'),
  breacherTorsion: kataphron('breacherTorsion'),
  breacherHydraulic: kataphron('breacherHydraulic'),
  destroyer: kataphron('destroyer'),
  destroyerCulverin: kataphron('destroyerCulverin'),
  sicarianPrinceps: sicarian('carbine', true),
  sicarian: sicarian('carbine'),
  sicarianTaser: sicarian('taser'),
  kastelan: kastelan('combustor'),
  kastelanGun: kastelan('guns'),
  // wargear variants reuse the nearest art
  techDominusSerpenta: techPriest('dominus'),
  techDominusRay: techPriest('dominus'),
  techDominusSerpentaRay: techPriest('dominus'),
  techManipulusCannon: techPriest('manipulus'),
  rangerAlphaPistol: skitarii('pistol', { alpha: true }),
  rangerArquebus: skitarii('longRifle'),
  vanguardAlphaCarbine: skitarii('carbine', { alpha: true, vanguard: true }),
  vanguardArquebus: skitarii('longRifle', { vanguard: true }),
  vanguardOmnispex: skitarii('carbine', { omnispex: true, vanguard: true }),
  breacherTorsionHydraulic: kataphron('breacherTorsion'),
  destroyerFlamer: kataphron('destroyer'),
  destroyerCulverinPhosphor: kataphron('destroyerCulverin'),
  kastelanHeavyFists: kastelan('guns'),
  kastelanCombustorBlaster: kastelan('combustor'),
  kastelanCombustorTwin: kastelan('combustor'),
  kastelanHeavyTwin: kastelan('guns'),
  sulphurhoundAlpha: sulphurhound('pistols', true),
  sulphurhound: sulphurhound('pistols'),
  sulphurhoundCarbine: sulphurhound('carbine'),
  ironstrider: ironstrider('autocannon'),
  ironstriderLascannon: ironstrider('lascannon'),
  onager: onager('beamer'),
  onagerMissiles: onager('missiles'),
  onagerNeutron: onager('neutron'),
  onagerPhosphor: onager('phosphor'),
  electroPriest: electroPriest(),
  lieutenant: marine('swordPistol', { officer: true }),
  captain: marine('bolterSword', { officer: true }),
  hellblasterSergeant: marine('plasma', { sergeant: true }),
  hellblaster: marine('plasma'),
  infernusSergeant: marine('pyre', { sergeant: true }),
  infernusMarine: marine('pyre'),
  bladeguardSergeant: marine('swordShield', { sergeant: true }),
  bladeguardVeteran: marine('swordShield'),
  intercessorSergeant: marine('rifle', { sergeant: true }),
  intercessor: marine('rifle'),
  intercessorGL: marine('rifleGL'),
  assaultSergeant: marine('chainPistol', { sergeant: true }),
  assaultIntercessor: marine('chainPistol'),
  redemptor: redemptor(),
  deffDread: deffDread(),
  nob: ork('bigChoppa', { nob: true }),
  boy: ork('sluggaChoppa'),
  boyBigShoota: ork('bigShoota'),
  boyRokkit: ork('rokkit'),
  warboss: ork('kustomChoppa', { boss: true }),
  nobzNob: ork('krumpa', { nob: true }),
  gretchin: gretchin(),
  kommandoNob: ork('bigChoppa', { nob: true, kommando: true }),
  kommando: ork('sluggaChoppa', { kommando: true }),
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

/** Built-in blueprint token for a model profile, if one exists. */
export const portraitFor = (profileId: string): string | undefined => {
  // a wargear variant borrows the art of the profile it is built from
  const id = SVGS[profileId] ? profileId : VARIANT_FROM[profileId]
  return id && SVGS[id] ? svgDataUrl(SVGS[id]) : undefined
}

/** Every profile with a built-in token: its own art, or (wargear variants) the art of the profile it is built from. */
export const PORTRAIT_PROFILES = [...Object.keys(SVGS), ...Object.keys(VARIANT_FROM).filter((id) => !SVGS[id] && SVGS[VARIANT_FROM[id]])]
