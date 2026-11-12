import { describe, expect, it } from 'vitest'
import { WEAPONS } from '../data/datasheets'
import { weaponReach } from '../weaponAdvice'

describe('weapon reach in the loadout editor', () => {
  it('a gun shows its range, a melee weapon «ближний бой», two modes both ranges', () => {
    expect(weaponReach(WEAPONS.galvanicRifle)).toBe('30″')
    expect(weaponReach(WEAPONS.omnissianAxe)).toBe('ближний бой')
    expect(weaponReach(WEAPONS.eradicationRay)).toBe('24″ / 12″')
  })
})
