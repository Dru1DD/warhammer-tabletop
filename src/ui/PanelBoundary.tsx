import { Component, type ReactNode } from 'react'
import { tr } from '../i18n/index'

interface Props { name: string; resetKey?: unknown; children: ReactNode }
interface State { error: Error | null; resetKey?: unknown }

/**
 * A fuse around a side panel: a rendering error inside it shows a short notice instead of unmounting the whole game
 * (a white page). The battle state is not touched, so the board and the other panels keep working. The panel tries
 * again when `resetKey` changes (for example, another unit is selected) or on "Retry".
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
    console.error(tr('The “{name}” panel failed to render:', { name: this.props.name }), error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="rounded border border-rose-700 bg-rose-950/40 p-2 text-xs text-rose-100" role="alert">
        {tr('⚠ The “{name}” panel could not render: {message}. The game and the save are fine — you can carry on.', { name: this.props.name, message: this.state.error.message })}
        <button className="btn mt-1 w-full" onClick={() => this.setState({ error: null })}>{tr('Retry')}</button>
      </div>
    )
  }
}
