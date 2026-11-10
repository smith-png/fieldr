import React, { Component, ErrorInfo, ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  name?: string
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(
      `[ErrorBoundary${this.props.name ? `:${this.props.name}` : ''}] Caught error:`,
      error,
      errorInfo
    )
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback
      }
      return null
    }

    return this.props.children
  }
}
