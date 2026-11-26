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

const STALE_CONFLICT_PATTERNS = [
  /\bstale\b/i,
  /\bconflict\b/i,
  /\bconcurrent/i,
  /\boutdated\b/i,
  /\bstate mismatch\b/i,
  /already\s+(?:been\s+)?(?:sold|unsold|updated|changed|assigned|unassigned|queued|cleared|reversed|reviewed|approved|rejected|removed|deleted|active|on stage|not on stage)/i,
  /no player\s+(?:is\s+)?(?:currently\s+)?on stage/i,
  /not currently on stage/i,
  /stage is not/i,
  /not in\s+(?:an?\s+)?(?:active\s+)?auction/i,
  /no active bid/i,
  /no leading team/i,
  /no bid to clear/i,
  /no sale to undo/i,
  /bid must be (?:higher|greater)/i,
  /higher than (?:the )?current/i,
  /must exceed (?:the )?current/i,
  /player is not available/i,
  /player is not sold/i,
  /registration is not pending/i
]

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
  const message = getErrorMessage(err, '')
  if (!message) return false
  return STALE_CONFLICT_PATTERNS.some((pattern) => pattern.test(message))
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
