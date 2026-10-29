// Original blueprint-style tokens: a top-down technical drawing of each model
// on its base (no Games Workshop artwork). 100×100, facing +x; Orks are
// mirrored so both armies face each other. The board clips them to the base.

export const BLUEPRINT_LINE = { marines: '#8fd3ff', orks: '#b9e66b' } as const
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

type MarineGear = 'rifle' | 'rifleGL' | 'swordPistol'

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
  const weapon = gear === 'rifle' ? rifle : gear === 'rifleGL' ? rifle + gl : sword + pistol
  return base(c, cape + backpack + torso + pauldron(30) + pauldron(70) + chevron + head + weapon, false)
}

// ---------------------------------------------------------------- Orks

type OrkGear = 'sluggaChoppa' | 'bigShoota' | 'rokkit' | 'bigChoppa'

function ork(gear: OrkGear, opts: { nob?: boolean } = {}): string {
  const c = BLUEPRINT_LINE.orks
  const k = opts.nob ? 1.12 : 1
  const plate = (y: number, s: number) => `<path d="M34 ${y - 9 * s} L50 ${y - 12 * s} L56 ${y - 2 * s} L52 ${y + 9 * s} L36 ${y + 10 * s} L30 ${y} Z" ${f(c, 0.2)}/><line x1="38" y1="${y - 4 * s}" x2="48" y2="${y + 4 * s}" opacity="0.6"/>`
  const body = `<g transform="translate(46 50) scale(${k}) translate(-46 -50)">
    <ellipse cx="44" cy="50" rx="16" ry="21" ${f(c)}/>
    ${plate(29, 1)}${plate(71, -1)}
    <circle cx="61" cy="50" r="8.5" ${f(c, 0.25)}/>
    <path d="M67 45.5 L71 44 L68.5 48 Z M67 54.5 L71 56 L68.5 52 Z" fill="${c}" stroke="none"/>
    <circle cx="64" cy="47" r="1.2" fill="${c}" stroke="none"/><circle cx="64" cy="53" r="1.2" fill="${c}" stroke="none"/>
    ${opts.nob ? `<path d="M56 42 L50 33 L60 41 Z M56 58 L50 67 L60 59 Z" ${f(c, 0.5)}/><circle cx="44" cy="50" r="27" fill="none" stroke-dasharray="1.5 3" opacity="0.6"/>` : ''}
  </g>`
  const choppa = (big: boolean) => `<line x1="52" y1="${big ? 30 : 32}" x2="${big ? 84 : 76}" y2="${big ? 18 : 24}" stroke-width="2.4"/><path d="M${big ? 78 : 71} ${big ? 12 : 18} L${big ? 90 : 81} ${big ? 10 : 17} L${big ? 92 : 82} ${big ? 24 : 28} L${big ? 82 : 74} ${big ? 24 : 27} Z" ${f(c, 0.35)}/>`
  const slugga = `<rect x="58" y="61" width="15" height="6" rx="1.5" ${f(c, 0.3)}/>`
  const weapon = {
    sluggaChoppa: choppa(false) + slugga,
    bigChoppa: choppa(true) + slugga,
    bigShoota: `<rect x="55" y="55" width="35" height="10" rx="2" ${f(c, 0.3)}/><line x1="80" y1="58" x2="93" y2="58"/><line x1="80" y1="62" x2="93" y2="62"/><circle cx="62" cy="69" r="4.5" ${f(c, 0.35)}/>`,
    rokkit: `<rect x="34" y="59" width="54" height="9" rx="4.5" ${f(c, 0.3)}/><path d="M88 59 L96 63.5 L88 68 Z" ${f(c, 0.6)}/><line x1="44" y1="59" x2="44" y2="68"/>`,
  }[gear]
  return base(c, body + weapon, true)
}

const SVGS: Record<string, string> = {
  lieutenant: marine('swordPistol', { officer: true }),
  intercessorSergeant: marine('rifle', { sergeant: true }),
  intercessor: marine('rifle'),
  intercessorGL: marine('rifleGL'),
  nob: ork('bigChoppa', { nob: true }),
  boy: ork('sluggaChoppa'),
  boyBigShoota: ork('bigShoota'),
  boyRokkit: ork('rokkit'),
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

/** Built-in blueprint token for a model profile, if one exists. */
export const portraitFor = (profileId: string): string | undefined => (SVGS[profileId] ? svgDataUrl(SVGS[profileId]) : undefined)

export const PORTRAIT_PROFILES = Object.keys(SVGS)
