import type { WargearSpec } from './wargear'

// Adeptus Mechanicus wargear options, 11th edition datasheets (Wahapedia). Each variant is a model profile with that
// equipment (data/mechanicus.ts). Simplifications: the Alpha always carries the Alpha combat weapon (an optional extra on
// the datasheet), the enhanced data-tether is not offered (its effect is not in the game), and the Sicarian Princeps keeps
// the default weapons (the datasheet does not say whether it may swap).

const any = (size: number) => size

export const MECHANICUS_WARGEAR: Record<string, WargearSpec> = {
  techDominus: {
    leader: [
      { profile: 'techDominus', label: 'Макростаббер и волкитный бластер' },
      { profile: 'techDominusSerpenta', label: 'Фосфорная серпента и волкитный бластер' },
      { profile: 'techDominusRay', label: 'Макростаббер и луч искоренения' },
      { profile: 'techDominusSerpentaRay', label: 'Фосфорная серпента и луч искоренения' },
    ],
    base: { profile: 'techDominus', label: 'Техножрец-Доминус' },
    groups: [],
  },
  techManipulus: {
    leader: [
      { profile: 'techManipulus', label: 'Магнарельсовое копьё' },
      { profile: 'techManipulusCannon', label: 'Трансзвуковая пушка' },
    ],
    base: { profile: 'techManipulus', label: 'Техножрец-Манипулус' },
    groups: [],
  },
  rangers: {
    leader: [
      { profile: 'rangerAlpha', label: 'Альфа: гальваническая винтовка' },
      { profile: 'rangerAlphaPistol', label: 'Альфа: пистолет Механикус' },
    ],
    base: { profile: 'ranger', label: 'Гальваническая винтовка' },
    groups: [
      {
        id: 'special', label: 'Особое оружие — одно на отряд',
        variants: [
          { profile: 'rangerArc', label: 'Дуговая винтовка' },
          { profile: 'rangerCaliver', label: 'Плазменный калибр' },
          { profile: 'rangerArquebus', label: 'Трансурановая аркебуза' },
        ],
        max: () => 1,
      },
      { id: 'omnispex', label: 'Омниспекс — одна модель', variants: [{ profile: 'rangerOmnispex', label: 'Омниспекс (отряд игнорирует укрытие)' }], max: () => 1 },
    ],
  },
  vanguard: {
    leader: [
      { profile: 'vanguardAlpha', label: 'Альфа: пистолет Механикус' },
      { profile: 'vanguardAlphaCarbine', label: 'Альфа: радиевый карабин' },
    ],
    base: { profile: 'vanguard', label: 'Радиевый карабин' },
    groups: [
      {
        id: 'special', label: 'Особое оружие — по одному каждого вида',
        variants: [
          { profile: 'vanguardArc', label: 'Дуговая винтовка' },
          { profile: 'vanguardCaliver', label: 'Плазменный калибр' },
          { profile: 'vanguardArquebus', label: 'Трансурановая аркебуза' },
        ],
        max: () => 3,
        variantMax: { vanguardArc: 1, vanguardCaliver: 1, vanguardArquebus: 1 },
      },
      { id: 'omnispex', label: 'Омниспекс — одна модель', variants: [{ profile: 'vanguardOmnispex', label: 'Омниспекс (отряд игнорирует укрытие)' }], max: () => 1 },
    ],
  },
  breachers: {
    base: { profile: 'breacher', label: 'Тяжёлая дуговая винтовка и дуговой коготь' },
    groups: [
      {
        id: 'arms', label: 'Вооружение — любое число моделей',
        variants: [
          { profile: 'breacherTorsion', label: 'Торсионная пушка и дуговой коготь' },
          { profile: 'breacherHydraulic', label: 'Тяжёлая дуговая винтовка и гидрокоготь' },
          { profile: 'breacherTorsionHydraulic', label: 'Торсионная пушка и гидрокоготь' },
        ],
        max: any,
      },
    ],
  },
  destroyers: {
    base: { profile: 'destroyer', label: 'Тяжёлая гравипушка и фосфорный бластер' },
    groups: [
      {
        id: 'arms', label: 'Вооружение — любое число моделей',
        variants: [
          { profile: 'destroyerCulverin', label: 'Плазменная кулеврина и когнис-огнемёт' },
          { profile: 'destroyerFlamer', label: 'Тяжёлая гравипушка и когнис-огнемёт' },
          { profile: 'destroyerCulverinPhosphor', label: 'Плазменная кулеврина и фосфорный бластер' },
        ],
        max: any,
      },
    ],
  },
  sicarians: {
    leader: [{ profile: 'sicarianPrinceps', label: 'Принцепс: стабкарабин и силовое оружие' }],
    base: { profile: 'sicarian', label: 'Стабкарабин и силовое оружие' },
    groups: [
      { id: 'arms', label: 'Флешетный бластер и тазерный стрекач — любое число моделей', variants: [{ profile: 'sicarianTaser', label: 'Флешетный бластер и тазерный стрекач' }], max: (size) => size - 1 },
    ],
  },
  kastelans: {
    base: { profile: 'kastelan', label: 'Комбустор и сдвоенный кулак' },
    groups: [
      {
        id: 'arms', label: 'Вооружение — любое число моделей',
        variants: [
          { profile: 'kastelanGun', label: 'Тяжёлый фосфорный бластер, фосфорный бластер и кулак' },
          { profile: 'kastelanHeavyFists', label: 'Тяжёлый фосфорный бластер и сдвоенный кулак' },
          { profile: 'kastelanCombustorBlaster', label: 'Комбустор, фосфорный бластер и кулак' },
          { profile: 'kastelanCombustorTwin', label: 'Комбустор и сдвоенный фосфорный бластер' },
          { profile: 'kastelanHeavyTwin', label: 'Тяжёлый и сдвоенный фосфорные бластеры' },
        ],
        max: any,
      },
    ],
  },
}
