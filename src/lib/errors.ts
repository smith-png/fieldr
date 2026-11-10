export class AppError extends Error {
  readonly code?: string
  readonly originalError?: unknown

  constructor(message: string, options?: { code?: string; original?: unknown }) {
    super(message)
    this.name = 'AppError'
    this.code = options?.code
    this.originalError = options?.original

    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError)
    }
  }
}

export function toAppError(err: unknown, fallbackMessage = 'An unexpected error occurred'): AppError {
  if (err instanceof AppError) return err
  if (err instanceof Error) return new AppError(err.message, { original: err })
  if (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
  ) {
    return new AppError((err as { message: string }).message, { original: err })
  }
  if (typeof err === 'string' && err.trim().length > 0) {
    return new AppError(err)
  }
  return new AppError(fallbackMessage, { original: err })
}

export function getErrorMessage(err: unknown, fallbackMessage = 'An unexpected error occurred'): string {
  if (err instanceof Error && err.message) return err.message
  if (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
  ) {
    return (err as { message: string }).message
  }
  if (typeof err === 'string' && err.trim().length > 0) {
    return err
  }
  return fallbackMessage
}
