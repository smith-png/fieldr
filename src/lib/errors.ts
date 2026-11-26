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

export const CONFLICT_TOAST_MESSAGE = 'Already updated by another admin'

function extractErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined
  const rec = err as Record<string, unknown>
  if (typeof rec.code === 'string' && rec.code) return rec.code
  if (rec.originalError && typeof rec.originalError === 'object') {
    const orig = rec.originalError as Record<string, unknown>
    if (typeof orig.code === 'string' && orig.code) return orig.code
  }
  return undefined
}

export function isStaleConflictError(err: unknown): boolean {
  const code = extractErrorCode(err)
  if (code === '40001' || code === '40P01' || code === 'P0002') {
    return true
  }
  const message = getErrorMessage(err, '').trim()
  if (!message) return false
  return message.startsWith('Stale:')
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
