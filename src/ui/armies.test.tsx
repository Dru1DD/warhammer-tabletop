import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { decide } from '../game/ai/ai'
import { actor } from '../game/engine'
import { sidesOf } from '../game/gameState'
import { FACTIONS, type PlayerId } from '../game/types'
import { FACTION_EMBLEM } from '../assets/manifest'
import { AUTOSAVE_KEY, useStore } from '../store'

// Konva needs a real canvas; the board is covered by engine tests.
vi.mock('./Board', () => ({ Board: () => <div data-testid="board" /> }))

const reset = () => {
  localStorage.clear()
  useStore.setState({ game: null, match: null, history: [], message: null, deploying: null, review: null, deployHistory: [], draft: {} })
  useStore.getState().setSettings({ human: 'marines', opponent: 'orks', scenarioId: 'training-outpost', armies: {} })
}

describe('faction selection screen', () => {
  beforeEach(reset)

  it('shows the real composition of every army, not just its name', () => {
    render(<App />)
    const list = (name: string) => within(screen.getByLabelText(`Состав: ${name}`))
    expect(list('Космодесант').getByText(/Интерсессоры/)).toBeInTheDocument() // the selected small scenario
    const ty = list('Тираниды')
    for (const t of [/Тиран Улья/, /Термаганты/, /Гормагауны/, /Воины тиранидов/]) expect(ty.getByText(t)).toBeInTheDocument()
    expect(ty.getByText(/Всего моделей: 24/)).toBeInTheDocument()
    const ne = list('Некроны')
    for (const t of [/Оверлорд/, /Воины некронов/, /Скорпекх-разрушители/, /Рои скарабеев/]) expect(ne.getByText(t)).toBeInTheDocument()
    expect(ne.getByText(/Всего моделей: 17/)).toBeInTheDocument()
    const ae = list('Аэльдари')
    for (const t of [/Фарсир/, /Стражи-защитники/, /Грозные мстители/, /Райдеры ветра/]) expect(ae.getByText(t)).toBeInTheDocument()
    expect(ae.getByText(/Всего моделей: 20/)).toBeInTheDocument()
    const am = list('Адептус Механикус')
    for (const t of [/Техножрец-Доминус/, /Техножрец-Манипулус/, /Скитарии-рейнджеры/, /Скитарии-авангард/, /Катафроны-пробойщики/, /Катафроны-разрушители/, /Сикарии-диверсанты/, /Роботы Кастелан/]) expect(am.getByText(t)).toBeInTheDocument()
    expect(am.getByText(/Всего моделей: 36/)).toBeInTheDocument()
    expect(FACTION_EMBLEM.adeptus_mechanicus).toMatch(/^data:image\/svg\+xml/)
  })

  it('shows unit and army points and warns about a lopsided pairing', () => {
    useStore.getState().setSettings({ human: 'adeptus_mechanicus', opponent: 'orks', scenarioId: 'combat-patrol' })
    render(<App />)
    const am = within(screen.getByLabelText('Состав: Адептус Механикус'))
    expect(am.getByText(/Стоимость армии: ≈ 865 очк\./)).toBeInTheDocument()
    expect(am.getByText(/· 85 очк\./)).toBeInTheDocument() // Skitarii Rangers
    expect(within(screen.getByLabelText('Состав: Орки')).getByText(/Стоимость армии: 335 очк\./)).toBeInTheDocument()
    const matchup = screen.getByLabelText('Баланс армий по очкам')
    expect(matchup).toHaveTextContent(/≈ 865 очк\..*335 очк\./)
    expect(matchup).toHaveTextContent(/перевес примерно в 2\.6 раза/)
  })

  it('Adeptus Mechanicus can be picked as the player army and as the opponent', () => {
    render(<App />)
    fireEvent.click(screen.getByText('Адептус Механикус'))
    expect(useStore.getState().settings).toMatchObject({ human: 'adeptus_mechanicus', scenarioId: 'combat-patrol' })
    fireEvent.click(screen.getByText('Космодесант'))
    fireEvent.change(screen.getByLabelText(/Противник/), { target: { value: 'adeptus_mechanicus' } })
    expect(useStore.getState().settings).toMatchObject({ human: 'marines', opponent: 'adeptus_mechanicus' })
    fireEvent.click(screen.getByText('Начать новую битву'))
    expect(sidesOf(useStore.getState().game!)).toEqual(['marines', 'adeptus_mechanicus'])
  })

  it('picking a new army moves to a board that has it and starts a battle against any opponent', () => {
    render(<App />)
    fireEvent.click(screen.getByText('Некроны'))
    expect(useStore.getState().settings).toMatchObject({ human: 'necrons', scenarioId: 'combat-patrol' })
    fireEvent.change(screen.getByLabelText(/Противник/), { target: { value: 'aeldari' } })
    expect(useStore.getState().settings.opponent).toBe('aeldari')
    fireEvent.click(screen.getByText('Начать новую битву'))
    const g = useStore.getState().game!
    expect(useStore.getState().deploying).not.toBeNull()
    expect(sidesOf(g)).toEqual(['necrons', 'aeldari'])
    expect(screen.getByTestId('board')).toBeInTheDocument()
  })

  it('the opponent can never be the same army as the player', () => {
    render(<App />)
    fireEvent.click(screen.getByText('Орки')) // opponent was Orks
    expect(useStore.getState().settings.human).toBe('orks')
    expect(useStore.getState().settings.opponent).not.toBe('orks')
  })
})

describe('every army played by a human through the store (deployment, a full turn, the AI replying)', () => {
  beforeEach(reset)

  it.each(FACTIONS)('%s: deploy, play two rounds against the AI, autosave and reload', (human) => {
    const opponent: PlayerId = human === 'marines' ? 'orks' : 'marines'
    const st = () => useStore.getState()
    st().startDeployment({ human, opponent, scenarioId: 'combat-patrol', tutorial: false, explain: 'minimal', aiLevel: 'beginner' })
    expect(st().deploying).not.toBeNull()
    st().autoDeploy()
    expect(st().finishDeployment()).toBe(true)
    expect(sidesOf(st().game!)).toEqual(human === 'marines' ? ['marines', 'orks'] : ['marines', human])

    let humanCommands = 0
    for (let i = 0; st().game!.round < 3 && !st().game!.winner; i++) {
      expect(i, 'action cap').toBeLessThan(800)
      const g = st().game!
      if (actor(g) === human) {
        const d = decide(g, 'beginner')!
        expect(st().dispatch(d.cmd), `${human}: ${JSON.stringify(d.cmd).slice(0, 100)} -> ${st().message?.text}`).toBe(true)
        humanCommands++
      } else {
        expect(st().aiStep(), 'AI step').toBe(true)
      }
    }
    expect(humanCommands).toBeGreaterThan(5) // a whole turn: all five phases
    // every accepted action was recorded under the right participant
    const hist = st().match!.history
    expect(hist.some((a) => a.playerId === 'local')).toBe(true)
    expect(hist.some((a) => a.playerId === `ai-${opponent}`)).toBe(true)

    const saved = st().game!
    st().quit()
    expect(st().load(AUTOSAVE_KEY)).toBe(true)
    expect(st().game).toEqual(saved)
    expect(st().settings).toMatchObject({ human, opponent })
    expect(st().match!.history).toEqual(hist)
  })
})

describe('Adeptus Mechanicus army rule and abilities in the UI', () => {
  beforeEach(reset)

  /** Human Mechanicus deployed against the Marines, brought to their own Command phase before an Imperative is chosen. */
  const toCommand = () => {
    const st = () => useStore.getState()
    st().startDeployment({ human: 'adeptus_mechanicus', opponent: 'marines', scenarioId: 'combat-patrol', tutorial: false, explain: 'minimal', aiLevel: 'beginner' })
    st().autoDeploy()
    expect(st().finishDeployment()).toBe(true)
    for (let i = 0; i < 400; i++) {
      const g = st().game!
      if (actor(g) === 'adeptus_mechanicus' && g.phase === 'command' && g.players.adeptus_mechanicus.imperative === null) {
        // when the opponent went first and a unit lost half its models, the turn first waits for the Insane Bravery
        // reaction before the Battle-shock tests: pass it, as a player who keeps the CP would (the battle seed is random)
        if (g.reaction) { expect(st().dispatch({ type: 'passReaction' })).toBe(true); continue }
        return
      }
      if (actor(g) === 'adeptus_mechanicus') expect(st().dispatch(decide(g, 'beginner')!.cmd)).toBe(true)
      else expect(st().aiStep()).toBe(true)
    }
    throw new Error('never reached the Command phase')
  }

  it('the human picks a Doctrina Imperative with a button, then sees which one is active', () => {
    toCommand()
    render(<App />)
    fireEvent.click(screen.getByText(/Протектор: Heavy/))
    expect(useStore.getState().game!.players.adeptus_mechanicus.imperative).toBe('protector')
    expect(screen.getByText(/действует до вашей следующей фазы командования/)).toBeInTheDocument()
    expect(screen.queryByText(/Завоеватель: Assault/)).toBeNull()
  })

  it('the Manipulus card offers Defend the Divine Work, which works once per battle', () => {
    toCommand()
    useStore.setState({ selectedUnitId: 'manipulus' })
    render(<App />)
    const btn = screen.getByRole('button', { name: /Защита божественного труда/ })
    expect(btn).toBeEnabled()
    fireEvent.click(btn)
    expect(useStore.getState().game!.players.adeptus_mechanicus.divineUsed).toBe(true)
    expect(useStore.getState().game!.units.find((u) => u.id === 'manipulus')!.warded).toBe(true)
    expect(screen.getByRole('button', { name: /Защита божественного труда/ })).toBeDisabled()
  })

  it('the unit card shows the role description and the ability rules in Russian', () => {
    toCommand()
    useStore.setState({ selectedUnitId: 'kastelans', layout: { ...useStore.getState().layout, roster: true } })
    render(<App />)
    expect(screen.getByText(/Тяжёлые боевые платформы/)).toBeInTheDocument()
    expect(screen.getByText(/Отталкивающая решётка \(Repulsor Grid\)/)).toBeInTheDocument()
  })
})

describe('army builder on the start screen', () => {
  beforeEach(reset)

  it('a preset switches to the Combat Patrol board, edits update the points, going over the limit blocks the start', () => {
    render(<App />)
    const mine = within(screen.getByLabelText('Состав армии: Космодесант'))
    fireEvent.click(mine.getByText('Пресет 500'))
    expect(useStore.getState().settings).toMatchObject({ scenarioId: 'combat-patrol', armies: { marines: { limit: 500 } } })
    expect(mine.getByLabelText('Очки армии')).toHaveTextContent('480 / 500')
    // the opponent's builder is separate
    const theirs = within(screen.getByLabelText('Состав армии: Орки'))
    fireEvent.click(theirs.getByText('Пресет 500'))
    expect(theirs.getByLabelText('Очки армии')).toHaveTextContent('495 / 500')
    expect(screen.getByLabelText('Баланс армий по очкам')).toHaveTextContent(/480 очк\..*495 очк\./)
    // a bigger unit goes over the limit
    fireEvent.change(mine.getByLabelText('Размер отряда «Отделение интерсессоров»'), { target: { value: '10' } })
    expect(mine.getByLabelText('Очки армии')).toHaveTextContent('550 / 500')
    expect(mine.getByText('Свой список')).toBeInTheDocument()
    expect(screen.getByText('Начать новую битву')).toBeDisabled()
    expect(mine.getByLabelText('Ошибки состава')).toHaveTextContent('Перебор очков: 550 из 500.')
    // raising the limit makes it playable again; the battle uses the list
    fireEvent.change(mine.getByDisplayValue('500 очков'), { target: { value: '1000' } })
    expect(screen.getByText('Начать новую битву')).toBeEnabled()
    fireEvent.click(screen.getByText('Быстрый старт'))
    const g = useStore.getState().game!
    expect(g.scenarioId).toBe('combat-patrol')
    expect(g.units.filter((u) => u.owner === 'marines').map((u) => u.name)).toEqual(['Капитан', 'Лейтенант', 'Отделение интерсессоров', 'Отделение адских бластеров', 'Отделение Инфернус', 'Ветераны Bladeguard'])
    expect(g.units.find((u) => u.name === 'Отделение интерсессоров')!.models).toHaveLength(10)
    expect(g.units.filter((u) => u.owner === 'orks')).toHaveLength(5)
  })

  it('a preset over 1000 points moves the battle to the 44″×60″ board and says why', () => {
    render(<App />)
    const mine = within(screen.getByLabelText('Состав армии: Космодесант'))
    fireEvent.click(mine.getByText('Пресет 2000'))
    expect(useStore.getState().settings).toMatchObject({ scenarioId: 'strike-force', armies: { marines: { limit: 2000 } } })
    expect(mine.getByLabelText('Очки армии')).toHaveTextContent('1985 / 2000')
    expect(mine.getByText(/Больше 1000 очков: битва идёт на поле 44″×60″/)).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /составам больше 1000 очков нужно поле побольше/ })).toBeDisabled()
    // back to 1000 points: Combat Patrol takes the list again
    fireEvent.change(mine.getByDisplayValue('2000 очков'), { target: { value: '1000' } })
    expect(screen.queryByText(/Больше 1000 очков/)).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /нужно поле побольше/ })).not.toBeInTheDocument()
  })

  it('removing units and going back to the training roster', () => {
    render(<App />)
    const mine = within(screen.getByLabelText('Состав армии: Космодесант'))
    fireEvent.click(mine.getByText('Пресет 500'))
    fireEvent.click(mine.getByLabelText('Убрать «Ветераны Bladeguard»'))
    expect(mine.getByLabelText('Очки армии')).toHaveTextContent('400 / 500')
    fireEvent.click(mine.getByText('Учебный состав'))
    expect(useStore.getState().settings.armies).toEqual({})
    expect(within(screen.getByLabelText('Состав: Космодесант')).getByText(/Стоимость армии: 475 очк\./)).toBeInTheDocument() // the Combat Patrol training roster (the board stays)
  })
})
