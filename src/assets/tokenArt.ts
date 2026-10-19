// Original token portraits drawn as SVG (no Games Workshop artwork).
// Each portrait is a 100×100 bust that the board clips to the model's base.

type Gear = 'none' | 'gl' | 'bigShoota' | 'rokkit' | 'sword' | 'choppa'

interface MarineOpts {
  armour: string
  trim: string
  lens: string
  crest?: string
  laurel?: boolean
  stripe?: string
  gear: Gear
}

interface OrkOpts {
  skin: string
  big?: boolean
  helmet?: string
  gear: Gear
}

const gearIcon = (g: Gear) => {
  switch (g) {
    case 'gl':
      return '<g transform="translate(66 64)"><rect x="0" y="6" width="26" height="9" rx="2" fill="#2d2d2d" stroke="#111" stroke-width="1.5"/><circle cx="22" cy="10.5" r="6" fill="#4a4a4a" stroke="#111" stroke-width="1.5"/></g>'
    case 'bigShoota':
      return '<g transform="translate(60 66)"><rect x="0" y="4" width="34" height="10" rx="2" fill="#5a4a36" stroke="#1d1710" stroke-width="1.5"/><rect x="26" y="1" width="10" height="4" fill="#3a3a3a"/><rect x="8" y="13" width="7" height="9" fill="#c9a227" stroke="#1d1710" stroke-width="1"/></g>'
    case 'rokkit':
      return '<g transform="translate(56 60) rotate(-20)"><rect x="0" y="6" width="38" height="10" rx="3" fill="#6b6b6b" stroke="#111" stroke-width="1.5"/><path d="M38 6 l8 5 l-8 5 z" fill="#c0392b" stroke="#111" stroke-width="1.2"/></g>'
    case 'sword':
      return '<g transform="translate(86 34) rotate(18)"><rect x="-2.5" y="0" width="5" height="40" fill="#b9e3ff" stroke="#1b4f72" stroke-width="1.2"/><rect x="-8" y="38" width="16" height="4" fill="#c9a227"/><rect x="-2" y="42" width="4" height="9" fill="#5a3b1e"/></g>'
    case 'choppa':
      return '<g transform="translate(84 30) rotate(20)"><rect x="-2.5" y="8" width="5" height="44" fill="#5a3b1e" stroke="#1d1710" stroke-width="1.2"/><path d="M-3 0 L14 4 L16 26 L-3 22 Z" fill="#9a9a9a" stroke="#222" stroke-width="1.5"/><path d="M14 4 L16 26" stroke="#e8e8e8" stroke-width="1.5"/></g>'
    default:
      return ''
  }
}

export function marineSvg(o: MarineOpts): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="65%"><stop offset="0" stop-color="#3b5d8f"/><stop offset="1" stop-color="#14233d"/></radialGradient>
    <linearGradient id="arm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${o.armour}" stop-opacity="1"/><stop offset="1" stop-color="#0d1f44"/></linearGradient>
  </defs>
  <rect width="100" height="100" fill="url(#bg)"/>
  <!-- shoulder pads -->
  <ellipse cx="18" cy="88" rx="22" ry="18" fill="url(#arm)" stroke="${o.trim}" stroke-width="3"/>
  <ellipse cx="82" cy="88" rx="22" ry="18" fill="url(#arm)" stroke="${o.trim}" stroke-width="3"/>
  <!-- chest / collar -->
  <path d="M30 100 L32 74 Q50 66 68 74 L70 100 Z" fill="url(#arm)" stroke="#0a142b" stroke-width="2"/>
  <path d="M38 80 L50 88 L62 80" fill="none" stroke="${o.trim}" stroke-width="3"/>
  ${o.crest ? `<path d="M50 6 Q72 10 70 30 L50 24 L30 30 Q28 10 50 6 Z" fill="${o.crest}" stroke="#4a0d0d" stroke-width="1.5"/>` : ''}
  <!-- helmet -->
  <path d="M28 44 Q28 16 50 16 Q72 16 72 44 L70 62 Q60 74 50 74 Q40 74 30 62 Z" fill="url(#arm)" stroke="#0a142b" stroke-width="2.5"/>
  ${o.stripe ? `<rect x="46" y="16" width="8" height="26" fill="${o.stripe}"/>` : ''}
  <!-- faceplate -->
  <path d="M34 44 L66 44 L62 62 Q50 70 38 62 Z" fill="#1c2f55" stroke="#0a142b" stroke-width="1.5"/>
  <path d="M36 42 L48 46 L46 52 L35 49 Z" fill="${o.lens}" stroke="#0a0a0a" stroke-width="1.2"/>
  <path d="M64 42 L52 46 L54 52 L65 49 Z" fill="${o.lens}" stroke="#0a0a0a" stroke-width="1.2"/>
  <rect x="44" y="56" width="12" height="9" rx="2" fill="#0d1a33" stroke="${o.trim}" stroke-width="1"/>
  <path d="M46 58 v5 M50 58 v5 M54 58 v5" stroke="${o.trim}" stroke-width="1"/>
  ${o.laurel ? `<path d="M30 36 Q40 26 50 25 Q60 26 70 36" fill="none" stroke="#e4b33a" stroke-width="4" stroke-dasharray="5 2"/>` : ''}
  ${gearIcon(o.gear)}
</svg>`
}

export function orkSvg(o: OrkOpts): string {
  const w = o.big ? 1.1 : 1
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="65%"><stop offset="0" stop-color="#6b5b3a"/><stop offset="1" stop-color="#2a2316"/></radialGradient>
    <radialGradient id="sk" cx="45%" cy="35%" r="70%"><stop offset="0" stop-color="${o.skin}"/><stop offset="1" stop-color="#1f3b12"/></radialGradient>
  </defs>
  <rect width="100" height="100" fill="url(#bg)"/>
  <g transform="translate(50 54) scale(${w}) translate(-50 -54)">
  <!-- shoulders with armour scraps -->
  <path d="M6 100 Q10 76 30 74 L70 74 Q90 76 94 100 Z" fill="#4b3a26" stroke="#1d1710" stroke-width="2"/>
  <path d="M12 86 L30 78 L32 88 Z M88 86 L70 78 L68 88 Z" fill="#8a8a8a" stroke="#222" stroke-width="1.2"/>
  <!-- ears -->
  <path d="M22 40 L6 30 L20 52 Z" fill="url(#sk)" stroke="#132308" stroke-width="2"/>
  <path d="M78 40 L94 30 L80 52 Z" fill="url(#sk)" stroke="#132308" stroke-width="2"/>
  <!-- head -->
  <path d="M24 34 Q26 14 50 14 Q74 14 76 34 L78 56 Q76 76 50 80 Q24 76 22 56 Z" fill="url(#sk)" stroke="#132308" stroke-width="2.5"/>
  ${o.helmet ? `<path d="M24 34 Q26 10 50 10 Q74 10 76 34 Q50 26 24 34 Z" fill="${o.helmet}" stroke="#222" stroke-width="2"/><path d="M28 22 L18 8 L34 18 Z M72 22 L82 8 L66 18 Z" fill="#d9d2c0" stroke="#222" stroke-width="1.5"/>` : ''}
  <!-- brow -->
  <path d="M28 38 L46 44 L50 40 L54 44 L72 38" fill="none" stroke="#132308" stroke-width="4" stroke-linecap="round"/>
  <!-- eyes -->
  <ellipse cx="38" cy="46" rx="5" ry="3.5" fill="#ff2a1a" stroke="#300" stroke-width="1"/>
  <ellipse cx="62" cy="46" rx="5" ry="3.5" fill="#ff2a1a" stroke="#300" stroke-width="1"/>
  <!-- nose & jaw -->
  <path d="M46 52 Q50 58 54 52" fill="none" stroke="#132308" stroke-width="2"/>
  <path d="M30 62 Q50 76 70 62 L68 70 Q50 82 32 70 Z" fill="#2a0e0a" stroke="#132308" stroke-width="2"/>
  <path d="M34 64 L38 54 L42 66 Z M66 64 L62 54 L58 66 Z" fill="#f2ead2" stroke="#55503f" stroke-width="1"/>
  <path d="M44 68 l3 -4 l3 4 l3 -4 l3 4" fill="none" stroke="#f2ead2" stroke-width="1.5"/>
  </g>
  ${gearIcon(o.gear)}
</svg>`
}

const ULTRA = '#2257b5'
const GOLD = '#e4b33a'

const SVGS: Record<string, string> = {
  lieutenant: marineSvg({ armour: ULTRA, trim: GOLD, lens: '#ff3b2f', crest: '#b3201a', laurel: true, gear: 'sword' }),
  intercessorSergeant: marineSvg({ armour: ULTRA, trim: GOLD, lens: '#ff3b2f', stripe: '#b3201a', gear: 'none' }),
  intercessor: marineSvg({ armour: ULTRA, trim: '#d8d8d8', lens: '#ff3b2f', gear: 'none' }),
  intercessorGL: marineSvg({ armour: ULTRA, trim: '#d8d8d8', lens: '#ff3b2f', gear: 'gl' }),
  nob: orkSvg({ skin: '#5f9a35', big: true, helmet: '#6e6e6e', gear: 'choppa' }),
  boy: orkSvg({ skin: '#6aa63d', gear: 'none' }),
  boyBigShoota: orkSvg({ skin: '#6aa63d', gear: 'bigShoota' }),
  boyRokkit: orkSvg({ skin: '#6aa63d', gear: 'rokkit' }),
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

/** Built-in portrait for a model profile (data URL), or undefined if none drawn. */
export const portraitFor = (profileId: string): string | undefined => (SVGS[profileId] ? svgDataUrl(SVGS[profileId]) : undefined)

export const PORTRAIT_PROFILES = Object.keys(SVGS)
