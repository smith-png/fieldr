/**
 * Case-insensitive match between a sport string or Sport object (id / name) and a target string.
 */
export function matchesSport(
  sport: string | { id?: string; name: string } | null | undefined,
  target: string | null | undefined
): boolean {
  if (!sport || !target) return false
  const targetClean = target.trim().toLowerCase()
  if (typeof sport === 'string') {
    return sport.trim().toLowerCase() === targetClean
  }
  return (
    sport.name.trim().toLowerCase() === targetClean ||
    (typeof sport.id === 'string' && sport.id.trim().toLowerCase() === targetClean)
  )
}

/**
 * Extracts up to 2 uppercase initials from a full name for avatar fallbacks.
 */
export function getInitials(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

/**
 * Formats numerical points or prices with locale-aware thousand separators.
 */
export function formatPoints(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString()
}

const DISALLOWED_CSS_COLORS = new Set([
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer'
])

/**
 * Validates a team color string for safe CSS usage, rejecting keywords or injection chars.
 */
export function getValidTeamColor(color?: string | null): string | null {
  const clean = color?.trim()
  if (!clean) return null
  if (DISALLOWED_CSS_COLORS.has(clean.toLowerCase())) return null
  if (/[;{}<>]/.test(clean)) return null

  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    return CSS.supports('color', clean) ? clean : null
  }

  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(clean)
    ? clean
    : null
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

export function toNullableFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const MAX_PDF_BYTES = 20 * 1024 * 1024 // 20 MB

export function validatePdfFile(file: File): string | null {
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) {
    return 'Only PDF files are allowed.'
  }
  if (file.size > MAX_PDF_BYTES) {
    return 'PDF file must be 20 MB or smaller.'
  }
  return null
}

export function formatDocumentDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}


