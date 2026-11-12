# How to play a unit

The unit card in the left panel has a “🧭 How to play” block. For an enemy unit it is called “What to expect from it”. It shows:

- **Role and tips:** the unit's role and two tips on using it:
  - 🎯 shooters: stay at range and in cover, keep out of melee;
  - ⚔ assault: approach under cover, charge what it cuts down best;
  - 🪖 screen: go in front, hold objectives;
  - 👑 character: stay with the unit it buffs;
  - 🥷 infiltrators: grab far objectives, hit and hide.
- **Strongest against:** which kind of target its guns, and for non-shooters its melee, are best against: hordes, armoured infantry, or vehicles and monsters.
- **Afraid of:** the kind of attack that hurts it most, from its profile:
  - vehicles, monsters and units of 5+ wounds per model fear heavy weapons;
  - 5+ saves fear volume of fire;
  - everything else fears AP −2 and multi-damage weapons.
- **In a battle:** the two enemy units it deals the most damage to, and the two that are most dangerous to it.

The role comes from the datasheet, the same `unitProfile` the deployment presets use (`army/roles.ts`). The ratings use `profileVs` from `weaponAdvice.ts`, which now also counts an invulnerable save when it is better than the armour save after AP. All numbers are averages, without cover, range or line of sight. The code is in `src/game/unitAdvice.ts` and `src/ui/UnitRoleTips.tsx`, and the tests in `unitAdvice.test.ts`.
