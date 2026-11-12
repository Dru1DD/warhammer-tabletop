import { Component, type ReactNode } from 'react'

interface Props { name: string; resetKey?: unknown; children: ReactNode }
interface State { error: Error | null; resetKey?: unknown }

/**
 * A fuse around a side panel: a rendering error inside it shows a short notice instead of unmounting the whole game
 * (a white page). The battle state is not touched, so the board and the other panels keep working. The panel tries
 * again when `resetKey` changes (for example, another unit is selected) or on «Повторить».
 */
export class PanelBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  // another selection (or whatever `resetKey` tracks) gives the panel a fresh try
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null
  }

  componentDidCatch(error: Error) {
    console.error(`Панель «${this.props.name}» не отрисовалась:`, error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="rounded border border-rose-700 bg-rose-950/40 p-2 text-xs text-rose-100" role="alert">
        ⚠ Панель «{this.props.name}» не смогла отрисоваться: {this.state.error.message}. Игра и сохранение в порядке — можно продолжать.
        <button className="btn mt-1 w-full" onClick={() => this.setState({ error: null })}>Повторить</button>
      </div>
    )
  }
}
