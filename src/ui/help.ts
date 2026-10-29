import type { AttackStep, ExplainLevel, GameState, Phase, PlayerId } from '../game/types'
import type { MeasurePoint } from '../store'

// Short original explanations (not rulebook text). Shown according to the
// selected explanation level.

export const PHASE_HELP: Record<Phase, { short: string; long: string }> = {
  command: {
    short: 'Получите 1 CP. Отряды на половине численности проверяют боевой шок.',
    long: 'В начале хода оба игрока получают 1 очко командования (CP). Отряды активного игрока, потерявшие половину моделей (или уже находящиеся в боевом шоке), бросают 2D6: если результат не меньше Лидерства (Ld), всё в порядке, иначе отряд получает боевой шок (Battle-shock) — его OC становится 0. Затем начисляются очки за цели. Орки могут здесь объявить WAAAGH! (раз за битву).',
  },
  movement: {
    short: 'Двигайте модели не дальше M. Не ближе 2″ к врагу. Отряд должен оставаться связным.',
    long: 'Выберите свой отряд и перетащите модели (по умолчанию двигается весь отряд; отключите «Двигать отрядом», чтобы ставить модели по одной). Каждая модель может пройти не больше своей характеристики M по прямой. Нельзя проходить сквозь вражеские модели, заканчивать движение в зоне контакта (engagement range, 2″) с врагом и разрывать связность (coherency): каждая модель в пределах 2″ от другой и в пределах 9″ от всех. Продвижение (Advance) добавляет D6″, но после него нельзя атаковать (charge) и стреляет только оружие Assault. Отряд в контакте может только отступить (Fall Back) — тогда он не стреляет и не атакует в этот ход.',
  },
  shooting: {
    short: 'Выберите цель: нужна видимость и дистанция. Броски: попадание → ранение → спасбросок → урон.',
    long: 'Каждая модель стреляет из оружия, если видит хотя бы одну модель цели и цель в пределах дистанции (меряется от края подставки до края подставки). Последовательность: бросок на попадание (BS), на ранение (Сила против Стойкости), спасбросок защитника (Sv, ухудшенный AP, или непробиваемый), затем урон (D). Если цель в укрытии (в зоне руин/воронки или частично скрыта руинами), навык стрелка ухудшается на 1. Отряд в контакте может стрелять только оружием Close-quarters (пистолеты) по отряду, с которым он в контакте.',
  },
  charge: {
    short: 'Отряд в пределах 12″ от врага может атаковать: 2D6 — максимальная дистанция.',
    long: 'Объявите атаку (charge) отрядом, который находится в пределах 12″ от врага и не продвигался/не отступал в этот ход. Бросьте 2D6: это максимальная дистанция перемещения. Цели — враги в пределах этой дистанции. Атаковавший отряд должен закончить движение в зоне контакта (2″) со всеми целями и получает «Бьёт первым» (Fights First). Бросок 2 никогда не достаточен.',
  },
  fight: {
    short: 'Отряды в контакте сражаются. Атаковавшие бьют первыми, затем по очереди.',
    long: 'В начале фазы все отряды в контакте подходят (pile-in) до 3″ к врагу. Сначала сражаются отряды с правом «Бьёт первым» (совершившие атаку), затем остальные, по очереди начиная с активного игрока. Сражаются модели в зоне контакта (2″) с вражеским отрядом. После всех боёв отряды закрепляются (consolidate) до 3″.',
  },
}

/** Beginner explanation of one recorded attack step (uses only what the engine recorded). */
export function explainStep(step: AttackStep): { text: string; result: string } {
  const n = step.dice.length
  const ok = step.dice.filter((d) => d.success).length
  switch (step.label) {
    case 'Попадание':
      if (!n) return { text: step.note ?? 'Бросок на попадание не нужен.', result: '' }
      const extra = (step.note ?? '').split('; ').filter((x) => x && !x.startsWith('натуральная')).join('; ')
      return {
        text: `Атакующий бросает ${n} куб. — по одному на каждую атаку. Нужно ${step.target} или больше: это навык оружия (BS/WS).${extra ? ` Учтено: ${extra}.` : ''} 1 — всегда промах, 6 — всегда попадание.`,
        result: `Попаданий: ${ok} из ${n}.`,
      }
    case 'Ранение':
      if (!n) return { text: 'Попаданий нет — ранить нечем.', result: step.note && /авто/.test(step.note) ? step.note : '' }
      return {
        text: `За каждое попадание — ещё один кубик. Нужное число зависит от Силы оружия против Стойкости цели (${step.note}): сила вдвое больше — 2+, больше — 3+, равна — 4+, меньше — 5+, вдвое меньше — 6+. Здесь нужно ${step.target}.`,
        result: `Ранений: ${ok} из ${n}.`,
      }
    case 'Спасбросок':
      if (!n) return { text: 'Ранений нет — защитнику нечего отражать.', result: '' }
      return {
        text: `Теперь бросает защитник — по кубику на каждую рану. ${step.note}. Выпало ${step.target} или больше — броня выдержала.`,
        result: `Отражено: ${ok}, прошло: ${n - ok}.`,
      }
    case 'Атаки':
      return { text: `У этого оружия случайное число атак (${step.target}): бросаем кубик за каждую стреляющую модель${step.target.startsWith('D3') ? ' (D3 — это D6, делённый пополам с округлением вверх)' : ''}.`, result: step.note ?? '' }
    case 'Урон':
      if (n) return { text: `Урон этого оружия случайный (${step.target.replace('D', '')}): за каждую непрошедшую рану бросаем кубик.`, result: step.note ?? '' }
      return { text: `Каждая непрошедшая рана снимает ${step.target.replace('D', '')} ран(ы) с модели. Когда раны модели кончаются, она погибает.`, result: step.note ?? '' }
    default:
      return { text: step.note ?? '', result: '' }
  }
}

/** Plain-language meaning of datasheet columns (tooltips + glossary). */
export const STAT_HELP: { key: string; name: string; text: string }[] = [
  { key: 'M', name: 'Движение (Move)', text: 'На сколько дюймов модель может пройти в фазе движения.' },
  { key: 'T', name: 'Стойкость (Toughness)', text: 'Насколько модель живучая. Чем выше, тем труднее её ранить: Сила оружия сравнивается со Стойкостью.' },
  { key: 'Sv', name: 'Спасбросок (Save)', text: 'Броня. Когда модель ранят, защитник бросает кубик: выпало это число или больше — рана отражена. 3+ — хорошая броня, 5+ — слабая.' },
  { key: 'W', name: 'Раны (Wounds)', text: 'Сколько урона модель выдержит, прежде чем погибнет.' },
  { key: 'Ld', name: 'Лидерство (Leadership)', text: 'Стойкость духа. Потрёпанный отряд бросает 2D6: нужно это число или больше, иначе — боевой шок.' },
  { key: 'OC', name: 'Контроль цели (Objective Control)', text: 'Сколько «веса» модель даёт при борьбе за маркер цели. У кого сумма OC рядом с целью больше, тот её контролирует.' },
  { key: 'Дист.', name: 'Дальность', text: 'Максимальное расстояние до цели в дюймах (от края подставки). «ближ.» — оружие ближнего боя.' },
  { key: 'A', name: 'Атаки (Attacks)', text: 'Сколько кубиков на попадание бросает одна модель этим оружием.' },
  { key: 'BS/WS', name: 'Навык (Ballistic/Weapon Skill)', text: 'Что нужно выбросить на кубике, чтобы попасть. 3+ значит 3, 4, 5 или 6.' },
  { key: 'S', name: 'Сила (Strength)', text: 'Сравнивается со Стойкостью цели: чем сильнее оружие, тем легче ранить.' },
  { key: 'AP', name: 'Бронебойность (Armour Penetration)', text: 'Ухудшает спасбросок цели: AP −1 превращает броню 3+ в 4+.' },
  { key: 'D', name: 'Урон (Damage)', text: 'Сколько ран снимает каждая непрошедшая атака.' },
]

/** Plain-language purpose of each phase: why it matters. */
export const PHASE_GOAL: Record<Phase, string> = {
  command: 'Подготовка хода: очки командования, проверки боевого шока, очки за удержание целей.',
  movement: 'Займите выгодные позиции: ближе к целям, в укрытии или на дистанции стрельбы.',
  shooting: 'Нанесите урон издалека, пока враг не добежал до ваших отрядов.',
  charge: 'Ворвитесь в ближний бой: атаковавший отряд бьёт первым.',
  fight: 'Отряды в контакте обмениваются ударами в ближнем бою.',
}

/** What happens when the player leaves this phase. */
export const PHASE_NEXT: Record<Phase, string> = {
  command: 'Далее — движение: можно будет переставить отряды.',
  movement: 'Далее — стрельба. Позиции отрядов зафиксируются.',
  shooting: 'Далее — атака (charge): отряды рядом с врагом могут рвануть в ближний бой.',
  charge: 'Далее — бой: отряды в контакте сражаются.',
  fight: 'Ход перейдёт к противнику.',
}

/** Short role description per datasheet for the army introduction. */
export const UNIT_ROLE: Record<string, string> = {
  lieutenant: 'Командир-одиночка: крепкий, метко стреляет и хорошо дерётся. Даёт отряду рядом «точные удары» (Lethal Hits).',
  intercessors: 'Основная пехота: надёжные болт-винтовки на 24″. Сильнее всего, когда стоят на месте или у цели.',
  boyz: 'Толпа орков: слабая стрельба, но опасна в ближнем бою. Стремится добежать до врага.',
  assaultIntercessors: 'Штурмовая пехота: пистолеты и цепные мечи. Бьёт сильнее, если сама атаковала (charge).',
  redemptor: 'Шагающая техника: очень прочный, мощная плазма на 36″ и сокрушительный кулак. Сквозь руины и лес не пройдёт.',
  deffDread: 'Шагающая техника орков: клешни рвут даже броню, огнемёт выжигает пехоту вблизи. Сквозь руины и лес не пройдёт.',
}

export type LearningStyle = 'guided' | 'assisted' | 'independent'

/** The three learning styles map onto the existing tutorial/explain settings. */
export const LEARNING_STYLE: Record<LearningStyle, { label: string; hint: string; settings: { tutorial: boolean; explain: ExplainLevel } }> = {
  guided: { label: 'Пошагово', hint: 'Уроки ведут по первому ходу, подробные объяснения.', settings: { tutorial: true, explain: 'beginner' } },
  assisted: { label: 'С подсказками', hint: 'Играете сами, подсказки и правила — по ходу игры.', settings: { tutorial: false, explain: 'beginner' } },
  independent: { label: 'Самостоятельно', hint: 'Минимум текста, правила — по запросу.', settings: { tutorial: false, explain: 'minimal' } },
}

export const learningStyleOf = (s: { tutorial: boolean; explain: ExplainLevel }): LearningStyle =>
  s.tutorial ? 'guided' : s.explain === 'minimal' ? 'independent' : 'assisted'

export interface LessonUi {
  selectedUnitId: string | null
  measure: { a: MeasurePoint | null; b: MeasurePoint | null }
  deploying: boolean
}

export interface Lesson {
  /** stable id: progress is stored by id, so lessons can be inserted/reordered */
  id: string
  title: string
  text: (human: PlayerId) => string
  /** `start` = game state when this lesson became current */
  done: (g: GameState, ui: LessonUi, human: PlayerId, start: TutorialStart) => boolean
}

export interface TutorialStart {
  round: number
  activePlayer: PlayerId
  diceCount: number
}

const myUnits = (g: GameState, p: PlayerId) => g.units.filter((u) => u.owner === p)

export const LESSONS: Lesson[] = [
  {
    id: 'deploy',
    title: 'Расстановка армии',
    text: () => 'Перед битвой расставьте свои отряды в подсвеченной зоне у своего края стола. Перетащите модель (едет весь отряд) и нажмите «✓ Поставить». Справа — список отрядов и что осталось сделать.',
    done: (_g, ui) => !ui.deploying,
  },
  {
    id: 'units',
    title: '1. Знакомство с отрядами',
    text: (h) => `Зелёная пунктирная рамка — ваш отряд (${h === 'marines' ? 'синие' : 'зелёные'}), который может действовать сейчас. Наведите курсор на любую модель — увидите её характеристики. Щёлкните по вражеской модели, чтобы выбрать её отряд; полная карточка с характеристиками — в панели отрядов слева (кнопка «»», если панель свёрнута).`,
    done: (g, ui, h) => g.units.some((u) => u.owner !== h && u.id === ui.selectedUnitId) || g.units.some((u) => u.owner === h && u.move !== 'none'),
  },
  {
    id: 'measure',
    title: '2. Измерение дистанции',
    text: () => 'Включите «📏 Линейку» (или клавиша R) и щёлкните по двум моделям — расстояние считается от края подставки до края подставки. Esc — выключить.',
    done: (_g, ui) => !!ui.measure.a && !!ui.measure.b,
  },
  {
    id: 'command',
    title: '3. Фаза командования',
    text: () => 'Внизу поля — панель действий. Нажмите «Далее: Движение ▶». (Если сейчас ход противника — подождите, ИИ ходит сам.)',
    done: (g, _ui, h) => g.activePlayer === h && g.phase !== 'command',
  },
  {
    id: 'move',
    title: '4. Движение',
    text: () => 'Перетащите модель выбранного отряда — по умолчанию едет весь отряд. Пунктирный круг — предел движения, сверху появится подсказка, можно ли так встать. Нажмите «✓ Подтвердить движение» или Enter.',
    done: (g, _ui, h) => g.units.some((u) => u.owner === h && u.move !== 'none') || (g.activePlayer === h && ['shooting', 'charge', 'fight'].includes(g.phase)),
  },
  {
    id: 'shoot',
    title: '5. Стрельба',
    text: () => 'Нажмите «Далее: Стрельба». Враги, по которым можно стрелять, подсвечены зелёным — просто щёлкните по ним. Во вкладке «Кубики» внизу видно каждый бросок и почему он успешен или нет.',
    done: (g, _ui, h, st) => myUnits(g, h).some((u) => u.shot) || g.diceLog.slice(st.diceCount).some((d) => d.player === h && d.steps.some((s) => s.label === 'Попадание')),
  },
  {
    id: 'charge',
    title: '6. Атака и бой',
    text: () => 'Если враг в пределах 12″, в фазе атаки нажмите «🎲 Объявить атаку», а потом щёлкните по подсвеченной цели. В фазе боя щёлкните по врагу в контакте. «Далее» до конца хода передаст ход противнику.',
    done: (g, _ui, h, st) => st.activePlayer === h && g.activePlayer !== h,
  },
  {
    id: 'enemy',
    title: '7. Ход противника',
    text: () => 'Компьютер действует по тем же правилам. Справа в «Решениях ИИ» видно, почему он сделал свой выбор. Удачи! Цель — набрать больше ПО за 5 раундов.',
    done: (g, _ui, h, st) => (st.activePlayer !== h && g.activePlayer === h) || !!g.winner,
  },
]

const LEVEL_RANK: Record<ExplainLevel, number> = { minimal: 0, standard: 1, beginner: 2 }
export const showAt = (entry: ExplainLevel, setting: ExplainLevel) => LEVEL_RANK[entry] <= LEVEL_RANK[setting]
