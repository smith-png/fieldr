import React, { Component, ErrorInfo, ReactNode } from 'react'

export interface ErrorBoundaryFallbackProps {
  error: Error | null
  componentStack: string | null
  reset: () => void
}

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode | ((props: ErrorBoundaryFallbackProps) => ReactNode)
  name?: string
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  componentStack: string | null
}

function getStackPreviewLines(error: Error | null, componentStack: string | null): string[] {
  const source = error?.stack || componentStack || ''
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5)
}

export const ErrorFallbackCard: React.FC<ErrorBoundaryFallbackProps> = ({
  error,
  componentStack,
  reset
}) => {
  const errorName = error?.name || 'Error'
  const errorMessage = error?.message || 'An unexpected error occurred.'
  const stackLines = getStackPreviewLines(error, componentStack)

  return (
    <div className="min-h-dvh bg-bg text-text flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-surface border border-error/30 border-t-2 border-t-error rounded-2xl p-8 text-center space-y-4 shadow-xl">
        <span className="w-3 h-3 rounded-full bg-error ring-4 ring-error/20 inline-block" />
        <h1 className="font-syne font-bold text-xl text-text">Something went wrong</h1>
        <p className="text-xs text-muted">
          Fieldr encountered an unexpected error. You can refresh the page to continue.
        </p>
        <div className="flex items-center justify-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 rounded-xl bg-surface-2 border border-border text-text text-xs font-semibold hover:border-error transition-colors cursor-pointer"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-xl bg-btn-bg text-btn-fg text-xs font-semibold hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/40 transition-opacity cursor-pointer"
          >
            Reload page
          </button>
        </div>
        <details className="text-left rounded-xl bg-bg border border-error/20 px-3.5 py-2.5 text-xs">
          <summary className="cursor-pointer select-none font-medium text-muted hover:text-error transition-colors">
            Details
          </summary>
          <div className="mt-2.5 pt-2.5 border-t border-error/20 space-y-1.5 font-mono text-[11px] leading-relaxed break-words">
            <div className="text-error font-semibold">{errorName}</div>
            <div className="text-muted">{errorMessage}</div>
            {stackLines.length > 0 && (
              <pre className="mt-1.5 whitespace-pre-wrap break-all text-[10px] text-muted/90 overflow-x-auto">
                {stackLines.join('\n')}
              </pre>
            )}
          </div>
        </details>
      </div>
    </div>
  )
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, componentStack: null }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const label = `[ErrorBoundary${this.props.name ? `:${this.props.name}` : ''}]`
    console.error(label, error, errorInfo.componentStack)
    this.setState({ componentStack: errorInfo.componentStack ?? null })
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, componentStack: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback({
          error: this.state.error,
          componentStack: this.state.componentStack,
          reset: this.handleReset
        })
      }
      if (this.props.fallback !== undefined) {
        return this.props.fallback
      }
      return null
    }

    return this.props.children
  }
}
