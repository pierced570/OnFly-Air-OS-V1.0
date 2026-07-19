import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/** Surfaces render crashes instead of a blank black screen. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[OnFly] UI crash', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink p-8 text-cream"
          data-theme="dispatcher"
        >
          <h1 className="text-xl font-semibold text-gold">Something broke</h1>
          <p className="max-w-lg text-center text-sm text-muted">
            {this.state.error.message}
          </p>
          <button
            type="button"
            className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink"
            onClick={() => {
              this.setState({ error: null })
              window.location.href = '/'
            }}
          >
            Reload app
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
