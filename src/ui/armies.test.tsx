import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { decide } from '../game/ai/ai'
import { actor } from '../game/engine'
import { sidesOf } from '../game/gameState'
import { FACTIONS, type PlayerId } from '../game/types'
import { AUTOSAVE_KEY, useStore } from '../store'

// Konva needs a real canvas; the board is covered by engine tests.
vi.mock('./Board', () => ({ Board: () => <div data-testid="board" /> }))

const reset = () => {
  localStorage.clear()
  useStore.setState({ game: null, match: null, history: [], message: null, deploying: null, review: null, deployHistory: [], draft: {} })
  useStore.getState().setSettings({ human: 'marines', opponent: 'orks', scenarioId: 'training-outpost' })
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
