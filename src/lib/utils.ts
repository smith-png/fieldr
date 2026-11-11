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

/**
 * Sorts seasons so the active season appears first, followed by newest created_at first.
 */
export function sortSeasons<T extends { is_active?: boolean; created_at: string }>(
  seasons: readonly T[]
): T[] {
  return [...seasons].sort((a, b) => {
    if (a.is_active && !b.is_active) return -1
    if (!a.is_active && b.is_active) return 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}
